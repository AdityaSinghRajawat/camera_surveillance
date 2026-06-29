#!/bin/sh
set -e

echo "[entrypoint] waiting for database..."
bun run scripts/waitForDb.ts

echo "[entrypoint] running migrations..."
bunx sequelize-cli db:migrate

echo "[entrypoint] running seeders (idempotent)..."
bunx sequelize-cli db:seed:all || echo "[entrypoint] seeders already applied or failed (continuing)"

echo "[entrypoint] starting server..."
exec bun run src/server.ts
