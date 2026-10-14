set -eu
stage=/root/peiliao-security/nginx-1.30.5-openssl-3.5.9-build
tail -n 3 "$stage/make.log" | awk '{print $NF}'
ps -eo pid,ppid,ni,pcpu,pmem,rss,comm --sort=-pcpu | head -n 9
free -m
