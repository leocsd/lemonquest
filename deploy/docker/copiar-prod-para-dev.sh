#!/usr/bin/env bash
# Copia o backup de hora em hora mais recente da produção para o banco do ambiente de dev no servidor.
# Rodar no servidor, de dentro do checkout de dev:   bash deploy/docker/copiar-prod-para-dev.sh
# A produção não é parada nem tocada (só lê a pasta de backups dela). O banco de dev atual é substituído.
set -euo pipefail

PROD_DIR="${LEMONQUEST_PROD_DIR:-$HOME/lemonquest}"
DEV_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DOCKER="${DOCKER:-sudo -n docker}"

if [ "$DEV_DIR" = "$(cd "$PROD_DIR" && pwd)" ]; then
  echo "Isto é o checkout de produção ($DEV_DIR). Rode a partir do checkout de dev." >&2
  exit 1
fi

# Os backups automáticos (lemonquest-AAAAMMDD-HH.db) saem consistentes (VACUUM INTO): copiar o .db vivo arriscaria um
# arquivo pela metade com o jogo rodando.
latest="$(ls -1 "$PROD_DIR/docker-data/backups"/lemonquest-*.db 2>/dev/null | sort | tail -1 || true)"
if [ -z "$latest" ]; then
  echo "Nenhum backup em $PROD_DIR/docker-data/backups." >&2
  exit 1
fi
echo "Backup da produção: $(basename "$latest")"

cd "$DEV_DIR"
$DOCKER compose stop
mkdir -p docker-data
# A pasta de dados pertence ao uid 1000 do container: a cópia roda num container descartável, como root.
$DOCKER run --rm -v "$latest:/src.db:ro" -v "$DEV_DIR/docker-data:/dst" alpine:3.22 \
  sh -c 'cp /src.db /dst/lemonquest.db && rm -f /dst/lemonquest.db-wal /dst/lemonquest.db-shm && chown 1000:1000 /dst/lemonquest.db'
$DOCKER compose up -d
echo "Banco de dev substituído; o dev está subindo na porta 2568."
