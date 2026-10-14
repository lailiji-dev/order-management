#!/usr/bin/env bash
set -euo pipefail
stage=/root/peiliao-security/panel-python-3.13.16-build
grep -n -B 2 -A 2 'error:' "$stage/make.log" | head -n 70
printf '\nCONFIGURED SSL\n'
grep -E 'OPENSSL_(INCLUDES|LDFLAGS|LIBS)|MODULE__SSL|^CC=' "$stage/Python-3.13.16/Makefile"
printf '\nOPENSSL INCLUDE VERSION\n'
grep 'OPENSSL_VERSION_TEXT' /root/peiliao-security/nginx-1.30.5-openssl-3.5.9-build/source/openssl-3.5.9/.openssl/include/openssl/opensslv.h
