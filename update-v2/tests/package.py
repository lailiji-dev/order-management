from pathlib import Path
import zipfile
base=Path(__file__).resolve().parents[1]
with zipfile.ZipFile(base/'shared-v2.zip','w',zipfile.ZIP_DEFLATED) as bundle:
    for name in ('site/peiliao.html','site/admin.html','site/shared.js','server/app.py','server/seed.json','server/backup.py'):
        bundle.write(base/name,name)
print('Deployment package created; no credentials or test data included.')
