#!/usr/bin/env bash
set -euo pipefail
nice -n 15 /usr/bin/python3 - <<'PY'
import importlib.util,sqlite3,json
spec=importlib.util.spec_from_file_location('secure_api','/www/server/peiliao-app/app.py')
api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)
common=('1234567','12345678','123456789','1234567890','12345678901','123456789123','1111111','11111111','88888888','888888888','admin123','root123','password','password123','qwerty123','Aa123456','123456.a','Abc123456','123456789Aa')
db=sqlite3.connect('file:/www/server/peiliao-app/data/peiliao.sqlite3?mode=ro',uri=True)
rows=db.execute("SELECT id,username,password FROM users WHERE role='employee'").fetchall();weak=[]
for uid,username,stored in rows:
    for candidate in common+(username+'123456',username+'12345678'):
        if api.password_ok(candidate,stored):weak.append(uid);break
print(json.dumps({'employees_checked':len(rows),'weak_common_password_user_ids':weak,'scope':'small common-password screening; not exhaustive'},sort_keys=True))
db.close()
PY
