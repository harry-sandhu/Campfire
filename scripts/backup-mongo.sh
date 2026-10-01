#!/usr/bin/env bash
# Dumps the Campfire database to a compressed archive. Needs the MongoDB Database Tools (mongodump).
#
#   MONGODB_URI="mongodb+srv://..." ./scripts/backup-mongo.sh [output-dir]
#
# Restore with:  mongorestore --uri "$MONGODB_URI" --gzip --archive=<file> --drop
# Run it from a scheduled job (cron, GitHub Actions schedule) and copy the archive somewhere other than the database host.
set -euo pipefail

: "${MONGODB_URI:?Set MONGODB_URI to the database connection string}"
dir="${1:-backups}"
mkdir -p "$dir"
file="$dir/campfire-$(date -u +%Y%m%dT%H%M%SZ).archive.gz"

mongodump --uri "$MONGODB_URI" --gzip --archive="$file"
echo "Backup written to $file"

# Keep the 14 most recent archives.
ls -1t "$dir"/campfire-*.archive.gz | tail -n +15 | xargs -r rm --
