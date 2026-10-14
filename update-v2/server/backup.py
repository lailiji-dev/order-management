"""Consistent SQLite SQL backup; compatible with Python 3.6."""
import datetime
import gzip
import os
from pathlib import Path
import sqlite3
import sys

def backup(database, destination):
    target = Path(destination)
    target.mkdir(parents=True, exist_ok=True)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    output = target / ('peiliao-' + stamp + '.sql.gz')
    temporary = target / (output.name + '.part')
    connection = sqlite3.connect(database, timeout=30)
    try:
        connection.execute('BEGIN')
        with gzip.open(str(temporary), 'wt', encoding='utf-8') as stream:
            for line in connection.iterdump():
                stream.write(line + '\n')
        os.chmod(str(temporary), 0o600)
        os.replace(str(temporary), str(output))
    finally:
        connection.close()
    for old in sorted(target.glob('peiliao-*.sql.gz'), reverse=True)[14:]:
        old.unlink()
    print('SQLite backup complete: ' + output.name)

if __name__ == '__main__':
    backup(sys.argv[1], sys.argv[2])
