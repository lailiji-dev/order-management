#!/usr/bin/env bash
set -euo pipefail
PYTHONDONTWRITEBYTECODE=1 /usr/bin/python3 /root/peiliao-security/v4/package/tests/security-api-test.py SecurityTests.test_login_persists_thirty_days_and_expires_at_exact_boundary_after_restart
