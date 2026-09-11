#!/bin/sh
set -eu

# Configuration is loaded by the same Node module in both entry points.
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

echo "检查并创建管理员账户..."
node scripts/createAdmin.js

echo "启动服务器..."
exec node app.js
