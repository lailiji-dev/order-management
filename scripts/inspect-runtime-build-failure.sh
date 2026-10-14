#!/usr/bin/env bash
set -euo pipefail
stage=/root/peiliao-security/panel-python-3.13.16-build
grep -n -A 4 -B 2 -E 'undefined symbol|failed on import|Failed to build|could not be imported|ImportError|error:' "$stage/make.log" | tail -n 60
grep -E 'MODULE__SSL_LDFLAGS|MODULE__HASHLIB_LDFLAGS' "$stage/Python-3.13.16/Makefile"
