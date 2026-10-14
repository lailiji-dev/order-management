#!/usr/bin/env bash
set -euo pipefail
cd /root/peiliao-upload/v3/package
/usr/bin/python3 tests/api-test.py
