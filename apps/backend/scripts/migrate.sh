#!/usr/bin/env sh
set -eu
echo "[migrate] running prisma migrate deploy"
cd /app/apps/backend
exec /app/node_modules/.bin/prisma migrate deploy --schema=prisma/schema
