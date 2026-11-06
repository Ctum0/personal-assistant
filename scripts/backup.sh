#!/usr/bin/env bash
set -euo pipefail

# Sofia Nightly Database Backup Script
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${PROJECT_ROOT}/data"
BACKUP_DIR="${DATA_DIR}/backups"
DB_FILE="${DATA_DIR}/sofia.db"
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%SZ")
BACKUP_FILE="${BACKUP_DIR}/sofia_backup_${TIMESTAMP}.db"

mkdir -p "${BACKUP_DIR}"

if [ ! -f "${DB_FILE}" ]; then
  echo "Error: Database file ${DB_FILE} not found."
  exit 1
fi

echo "Backing up SQLite database..."
sqlite3 "${DB_FILE}" ".backup '${BACKUP_FILE}'"

echo "Compressing backup..."
gzip -f "${BACKUP_FILE}"

echo "Backup complete: ${BACKUP_FILE}.gz ($(du -h "${BACKUP_FILE}.gz" | cut -f1))"

# Keep last 14 backups, delete older
find "${BACKUP_DIR}" -name "sofia_backup_*.db.gz" -mtime +14 -delete || true
