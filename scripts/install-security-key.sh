#!/usr/bin/env bash
set -euo pipefail
key=/root/peiliao-security/new-admin.pub
test -f "$key"
ssh-keygen -lf "$key"
install -d -m 700 /root/.ssh
touch /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
if ! grep -Fqx -- "$(cat "$key")" /root/.ssh/authorized_keys; then
  cat "$key" >> /root/.ssh/authorized_keys
fi
printf 'PASS public key installed; password policy unchanged until a new key connection is verified\n'
