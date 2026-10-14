"""Verify v3/v4 data retention; only the session-token representation may change.

Usage: python security-database-fingerprint.py DATABASE [PREVIOUS_FINGERPRINT]
Reads one consistent SQLite snapshot. Output contains only aggregate counts and
one digest, never row values, passwords, session tokens or customer information.
Python 3.6 and SQLite 3.26 compatible.
"""
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import sys


FORMAT = 'peiliao-security-v4'
COLLECTIONS = ('categories', 'products', 'orders')
RECORD_TABLES = ('users', 'sessions', 'order_meta', 'audit', 'migrations',
                 'login_attempts')
OPTIONAL_RECORD_TABLES = ('account_login_failures', 'deleted_users', 'user_permissions')
HASHED_SESSION = re.compile(r'sha256:[0-9a-f]{64}\Z')


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(',', ':'), allow_nan=False)


def session_token(value, schema_version):
    """Match app.py's sha256:<64 lowercase hex> migration exactly.

    Issued legacy cookies contain 43 URL-safe characters. The old migration
    hashes every stored non-prefixed string, so retain that same behavior when
    comparing older databases rather than silently dropping malformed rows.
    Version 4 must contain the hashed representation, never raw credentials.
    """
    if not isinstance(value, str):
        raise ValueError('Invalid stored session representation')
    if value.startswith('sha256:'):
        if not HASHED_SESSION.fullmatch(value):
            raise ValueError('Invalid stored session representation')
        return value
    if schema_version >= 4:
        raise ValueError('Raw session credential remains in version 4')
    return 'sha256:' + hashlib.sha256(value.encode('utf-8')).hexdigest()


def sorted_records(records):
    return sorted(records, key=canonical)


def fingerprint(database):
    uri = Path(database).resolve().as_uri() + '?mode=ro'
    db = sqlite3.connect(uri, uri=True)
    db.row_factory = sqlite3.Row
    try:
        # Keep tables consistent even if the caller has not stopped writers.
        db.execute('BEGIN')
        schema_version = db.execute('PRAGMA user_version').fetchone()[0]
        if schema_version > 4:
            raise ValueError('Unsupported database schema version')
        tables = {row[0] for row in db.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")}
        if not set(RECORD_TABLES + ('app_state',)).issubset(tables):
            raise ValueError('Required data tables are missing')
        app_rows = [dict(row) for row in db.execute('SELECT * FROM app_state')]
        row = next((item for item in app_rows if item['id'] == 1), None)
        if row is None:
            raise ValueError('Application state is missing')
        state = json.loads(row['body'])
        if not isinstance(state, dict):
            raise ValueError('Invalid application state')

        entity_records = []
        if 'entities' in tables:
            columns = {item[1] for item in db.execute('PRAGMA table_info(entities)')}
            payload = 'body' if 'body' in columns else 'payload'
            if payload not in columns:
                raise ValueError('Entity payload column is missing')
            for record in db.execute('SELECT * FROM entities'):
                item = dict(record)
                item[payload] = json.loads(item[payload])
                entity_records.append(item)
            for name in COLLECTIONS:
                state[name] = [item[payload] for item in entity_records
                               if item['collection'] == name]
        for name in COLLECTIONS:
            state[name] = sorted(state.get(name, []), key=lambda item: item['id'])

        # Preserve every stored column, including entity ordering/index fields
        # and the original state document. JSON whitespace/key order is semantic.
        for item in app_rows:
            item['body'] = json.loads(item['body'])
        records = {}
        for name in RECORD_TABLES + OPTIONAL_RECORD_TABLES:
            items = [dict(item) for item in db.execute('SELECT * FROM ' + name)] if name in tables else []
            if name == 'sessions':
                for item in items:
                    item['token'] = session_token(item['token'], schema_version)
            records[name] = sorted_records(items)
        value = {'state': state, 'app_state': sorted_records(app_rows),
                 'entities': sorted_records(entity_records), 'records': records}
        return {
            'format': FORMAT,
            'digest': hashlib.sha256(canonical(value).encode('utf-8')).hexdigest(),
            'orders': len(state['orders']),
            'products': len(state['products']),
            'categories': len(state['categories']),
            'users': len(records['users']),
            'sessions': len(records['sessions']),
            'audit': len(records['audit']),
            'migrations': len(records['migrations']),
            'login_attempts': len(records['login_attempts']),
            'next_number': row['next_number'],
            'revision': row['revision'],
        }
    finally:
        db.close()


def main():
    if len(sys.argv) not in (2, 3):
        raise SystemExit('Usage: security-database-fingerprint.py DATABASE [PREVIOUS_FINGERPRINT]')
    try:
        result = fingerprint(sys.argv[1])
        if len(sys.argv) == 3:
            with open(sys.argv[2], encoding='utf-8') as file:
                previous = json.load(file)
            if previous.get('format') != FORMAT or result['digest'] != previous.get('digest'):
                raise ValueError('Data fingerprint mismatch')
            print('PASS business data, users/passwords, sessions, audit, counters, migrations and login attempts preserved')
        else:
            print(json.dumps(result, sort_keys=True))
    except Exception:
        # Do not disclose SQLite exceptions, private paths or malformed values.
        raise SystemExit('Data fingerprint verification failed; deployment must stop or roll back')


if __name__ == '__main__':
    main()
