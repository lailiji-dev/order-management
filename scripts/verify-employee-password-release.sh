#!/usr/bin/env bash
set -euo pipefail
test "$(sha256sum /www/server/peiliao-app/app.py | cut -d' ' -f1)" = "$(sha256sum /root/peiliao-security/v4/package/server/app.py | cut -d' ' -f1)"
/usr/bin/python3 - <<'PY'
import importlib.util
from urllib.request import urlopen
spec=importlib.util.spec_from_file_location('released_api','/www/server/peiliao-app/app.py')
api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)
for length in range(4,11):
    password='0123456789'[:length]
    assert api.validate_employee_password(password)==password
for invalid in ('123','12345678901','123a','１２３４','1234\n'):
    try:api.validate_employee_password(invalid)
    except api.ApiError as error:assert error.status==400
    else:raise AssertionError('Invalid employee password accepted')
with urlopen('https://YOUR_APP_DOMAIN/admin.html',timeout=15) as response:
    page=response.read().decode('utf-8')
    assert '初始密码（4～10 位数字）' in page
    assert page.count('minlength="4" maxlength="10" pattern="[0-9]{4,10}"')==2
print('PASS deployed backend and public employee create/reset UI use exact 4–10 ASCII digits; no production test account created')
PY
systemctl is-active peiliao-shared.service peiliao-backup.timer
firewall-cmd --zone=peiliao-secure --query-port=8977/tcp
firewall-cmd --permanent --zone=peiliao-secure --query-port=8977/tcp
echo 'PASS requested panel access policy and services retained'
