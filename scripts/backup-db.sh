#!/bin/bash

# Database Backup Script
# Usage: ./scripts/backup-db.sh [qa|prod]

set -e

# Source utilities
source "$(dirname "$0")/utils.sh"

# Check arguments
if [ $# -ne 1 ]; then
    log_error "Usage: $0 [qa|prod]"
    exit 1
fi

ENV=$1
CONFIG_FILE=".supabase-${ENV}.toml"

# Validate environment
if [[ "$ENV" != "qa" && "$ENV" != "prod" ]]; then
    log_error "Environment must be 'qa' or 'prod'"
    exit 1
fi

# Check prerequisites
check_env_vars || exit 1
check_supabase_cli || exit 1

# Check if config file exists
if [ ! -f "$CONFIG_FILE" ]; then
    log_error "Configuration file not found: $CONFIG_FILE"
    exit 1
fi

log_info "Starting backup for $ENV environment..."

# Create backup directory
BACKUP_DIR=$(create_backup_dir "$ENV")
log_info "Backup directory: $BACKUP_DIR"

# Export schema
log_info "Exporting database schema..."
export_schema "$CONFIG_FILE" "$BACKUP_DIR/schema.sql"
log_success "Schema exported to $BACKUP_DIR/schema.sql"

# Export data (tables)
log_info "Exporting database data..."
npx supabase db dump --config "$CONFIG_FILE" --data-only > "$BACKUP_DIR/data.sql"
log_success "Data exported to $BACKUP_DIR/data.sql"

# Export migration history
log_info "Saving migration history..."
npx supabase migration list --config "$CONFIG_FILE" > "$BACKUP_DIR/migration_history.txt" 2>&1 || true
log_success "Migration history saved to $BACKUP_DIR/migration_history.txt"

# Create metadata file
cat > "$BACKUP_DIR/metadata.json" << EOF
{
  "environment": "$ENV",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "backup_type": "full",
  "backup_dir": "$BACKUP_DIR"
}
EOF

log_success "Backup completed successfully!"
log_info "Backup location: $BACKUP_DIR"

# Create a 'latest' symlink for easy access
LATEST_LINK="deployment-backups/${ENV}_latest"
rm -f "$LATEST_LINK"
ln -s "$(basename "$BACKUP_DIR")" "$LATEST_LINK"
log_info "Latest backup symlink: $LATEST_LINK"
