"""Compare semantic production data before/after storage migration, no private output."""
import hashlib
import json
import sqlite3
import sys

def canonical(value):
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def fingerprint(database):
    db=sqlite3.connect('file:'+database+'?mode=ro',uri=True);db.row_factory=sqlite3.Row
    row=db.execute('SELECT * FROM app_state WHERE id=1').fetchone();state=json.loads(row['body'])
    tables={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if 'entities' in tables:
        # v3 migration stores the same collections as individual JSON records.
        columns={r[1] for r in db.execute('PRAGMA table_info(entities)')}
        payload='body' if 'body' in columns else 'payload'
        for name in ('categories','products','orders'):
            state[name]=[json.loads(r[0]) for r in db.execute('SELECT '+payload+' FROM entities WHERE collection=?',(name,))]
    for name in ('categories','products','orders'):
        state[name]=sorted(state.get(name,[]),key=lambda item:item['id'])
    sensitive={}
    for name in ('users','sessions','order_meta','audit','migrations','login_attempts'):
        sensitive[name]=sorted([dict(r) for r in db.execute('SELECT * FROM '+name)],key=canonical)
    value={'state':state,'revision':row['revision'],'next_number':row['next_number'],'initialized':row['initialized'],'records':sensitive}
    result={'digest':hashlib.sha256(canonical(value).encode('utf-8')).hexdigest(),
            'orders':len(state['orders']),'products':len(state['products']),'categories':len(state['categories']),
            'users':len(sensitive['users']),'next_number':row['next_number'],'revision':row['revision']}
    db.close();return result
if __name__=='__main__':
    result=fingerprint(sys.argv[1])
    if len(sys.argv)>2:
        with open(sys.argv[2],encoding='utf-8') as file:previous=json.load(file)
        if result['digest']!=previous['digest']:
            raise SystemExit('Data fingerprint mismatch; deployment must roll back')
        print('PASS orders, catalogue, users, sessions, audit, counters and migration records preserved')
    else:print(json.dumps(result))
