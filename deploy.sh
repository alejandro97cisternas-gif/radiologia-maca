#!/bin/bash
# Deploy a VPS + migración Alembic
# Uso: bash deploy.sh
# Requiere: acceso SSH configurado al VPS (177.7.48.49)

set -e

VPS="root@177.7.48.49"
REMOTE_DIR="/var/www/radiologia-maca"

echo "==> Push a main..."
git push origin main

echo "==> Pull en VPS..."
ssh "$VPS" "cd $REMOTE_DIR && git pull"

echo "==> Migración Alembic..."
ssh "$VPS" "cd $REMOTE_DIR/backend && docker compose -f ../docker-compose.prod.yml exec -T backend alembic upgrade head"

echo "==> Rebuild y restart..."
ssh "$VPS" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml up -d --build backend frontend"

echo "==> Instalando cron de archivado (si no existe)..."
CRON_CMD="0 3 * * * curl -s -X POST https://novex.cloud/api/interno/archivar-casos-antiguos -H \"X-Cron-Secret: \$(grep SECRET_KEY /var/www/radiologia-maca/backend/.env | cut -d= -f2)\" >> /var/log/archivado-casos.log 2>&1"
ssh "$VPS" "(crontab -l 2>/dev/null | grep -q 'archivar-casos-antiguos') || (crontab -l 2>/dev/null; echo '$CRON_CMD') | crontab -"

echo "==> Listo."
