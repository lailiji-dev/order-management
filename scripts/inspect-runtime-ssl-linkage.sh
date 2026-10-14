#!/usr/bin/env bash
set -euo pipefail
candidate=$(cat /root/peiliao-security/panel-runtime313-stage/candidate-path)
"$candidate/bin/python3.13" - <<'PY'
import _ssl,_hashlib,ssl,cryptography.hazmat.bindings.openssl.binding as b
print('SSL module',getattr(_ssl,'__file__','builtin'))
print('Hash module',getattr(_hashlib,'__file__','builtin'))
print('SSL version',ssl.OPENSSL_VERSION)
binding=b.Binding();print('Cryptography OpenSSL',binding.ffi.string(binding.lib.OpenSSL_version(0)).decode())
PY
find "$candidate" -name 'libssl*' -o -name 'libcrypto*' -o -name '*_ssl*.so' -o -name '*_hashlib*.so'
ldd "$candidate/bin/python3.13"
printf '\nBUILD PROGRESS\n'
tail -n 3 /root/peiliao-security/nginx-1.30.5-openssl-3.5.9-build/make.log
