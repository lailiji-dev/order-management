#!/usr/bin/env bash
set -euo pipefail
systemctl is-active peiliao-shared.service peiliao-backup.timer
/usr/bin/python3 - <<'PY'
import collections,json,sqlite3
with sqlite3.connect('file:/www/server/peiliao-app/data/peiliao.sqlite3?mode=ro',uri=True) as db:
    counts=collections.Counter()
    for (body,) in db.execute("SELECT body FROM entities WHERE collection='products'"):
        for material in json.loads(body).get('recipe',[]):
            counts[str(material.get('unit') or '(legacy default)')]+=1
    assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    print('Recipe unit counts only:',json.dumps(dict(counts),ensure_ascii=False))
PY
