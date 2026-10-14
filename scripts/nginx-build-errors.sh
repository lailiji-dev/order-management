set -eu
stage=/root/peiliao-security/nginx-1.30.5-openssl-3.5.9-build
grep -nE 'error:|undefined reference|Error [0-9]' "$stage/make.log" | tail -n 25
ps -eo pid,ppid,comm,args | grep -E 'nginx-1.30.5|[m]ake -j2|[t]ail -n 90' | head -n 12
