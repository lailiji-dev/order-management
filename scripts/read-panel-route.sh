#!/usr/bin/env bash
set -eu
sed -n '115,140p;270,350p;1830,1890p' /www/server/panel/BTPanel/__init__.py
