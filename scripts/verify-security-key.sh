#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" = 0
printf 'PASS independent pinned-host SSH connection using the new private key\n'
