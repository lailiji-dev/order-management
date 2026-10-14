#!/usr/bin/env bash
set -euo pipefail
umask 077
stage=/root/peiliao-security/panel-threaded-openssl-build
install -d -m 700 "$stage"
archive=/root/peiliao-security/nginx-1.30.5-openssl-3.5.9-build/downloads/openssl-3.5.9.tar.gz
printf '603f5602e2eef00d77fbd429d34dcd5822bb301757a1bc9cdb24c670f1eb859a  %s\n' "$archive" | sha256sum --check --status
tar -xzf "$archive" -C "$stage"
cd "$stage/openssl-3.5.9"
./Configure linux-x86_64 --prefix=/www/server/panel/openssl-security-3.5.9 --openssldir=/etc/pki/tls no-shared no-tests -fPIC > "$stage/configure.log" 2>&1
printf 'Building thread-safe OpenSSL for Python, independently of Nginx libraries\n'
make -j2 > "$stage/make.log" 2>&1
make install_sw > "$stage/install.log" 2>&1
test -f /www/server/panel/openssl-security-3.5.9/lib64/libssl.a
printf 'PASS thread-safe OpenSSL 3.5.9 library built\n'
