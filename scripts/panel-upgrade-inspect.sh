set -eu
printf 'Panel runtime and disk status\n'
/www/server/panel/pyenv/bin/python --version
df -h /www/server/panel /root/peiliao-security
du -sh /www/server/panel /www/server/panel/pyenv
sha256sum /root/peiliao-security/panel-13.1.0.zip
printf 'Official stable version\n'
curl --proto '=https' --tlsv1.2 --max-time 30 -fsS https://www.bt.cn/api/panel/get_version
printf '\nCurrent panel version\n'
for file in /www/server/panel/version.pl /www/server/panel/data/version.pl; do if [ -f "$file" ]; then cat "$file"; fi; done
printf '\nPanel process status\n'
/etc/init.d/bt status
printf 'Vendor updater operations (read-only)\n'
sed -n '1,260p' /root/peiliao-security/vendor-update-panel.sh
printf 'Archive structure and requirements\n'
/usr/bin/python3 - <<'PY'
import zipfile, os
path='/root/peiliao-security/panel-13.1.0.zip'
with zipfile.ZipFile(path) as archive:
    names=archive.namelist()
    print('entries',len(names),'uncompressed_bytes',sum(row.file_size for row in archive.infolist()))
    print('root entries',sorted(set(row.split('/')[0] for row in names)))
    print('data entries',sum('/data/' in row for row in names))
    for row in names:
        if row.endswith(('requirements.txt','version.pl')):
            print(row)
            print(archive.read(row).decode('utf-8',errors='replace')[:6000])
    print('first paths',names[:40])
PY
printf 'Panel important directories (sizes only)\n'
for p in data vhost ssl config logs; do if [ -e /www/server/panel/$p ]; then du -sh /www/server/panel/$p; fi; done
