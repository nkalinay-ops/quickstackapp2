#!/bin/bash

# Rollback Script - Restore database from backup
# Usage: ./scripts/rollback.sh [qa|prod] [backup_dir]

set -e

# Source utilities
source "$(dirname "$0")/utils.sh"

# Check arguments
if [ $# -lt 1 ]; then
    log_error "Usage: $0 [qa|prod] [backup_dir]"
    log_info "If backup_dir is not provided, the latest backup will be used"
    exit 1
fi

ENV=$1
BACKUP_DIR=$2
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

# If backup directory not provided, use latest
if [ -z "$BACKUP_DIR" ]; then
    LATEST_LINK="deployment-backups/${ENV}_latest"
    if [ ! -L "$LATEST_LINK" ]; then
        log_error "No latest backup found for $ENV environment"
        log_info "Available backups:"
        ls -la deployment-backups/ | grep "${ENV}_"
        exit 1
    fi
    BACKUP_DIR="deployment-backups/$(readlink "$LATEST_LINK")"
    log_info "Using latest backup: $BACKUP_DIR"
fi

# Validate backup directory
if [ ! -d "$BACKUP_DIR" ]; then
    log_error "Backup directory not found: $BACKUP_DIR"
    exit 1
fi

# Check backup files
if [ ! -f "$BACKUP_DIR/schema.sql" ] || [ ! -f "$BACKUP_DIR/data.sql" ]; then
    log_error "Incomplete backup: missing schema.sql or data.sql"
    exit 1
fi

log_warning "ROLLBACK OPERATION FOR $ENV ENVIRONMENT"
log_warning "This will restore the database to the state in: $BACKUP_DIR"
echo ""

# Display backup metadata
if [ -f "$BACKUP_DIR/metadata.json" ]; then
    log_info "Backup metadata:"
    cat "$BACKUP_DIR/metadata.json"
    echo ""
fi

# Display migration history from backup
if [ -f "$BACKUP_DIR/migration_history.txt" ]; then
    log_info "Migration history at time of backup:"
    cat "$BACKUP_DIR/migration_history.txt"
    echo ""
fi

# Confirm rollback
confirm_action "This will RESTORE the $ENV database from backup. This operation is DESTRUCTIVE." || exit 1

# Create a backup of current state before rollback
log_info "Creating safety backup of current state before rollback..."
./scripts/backup-db.sh "$ENV"

# Create log file
create_log_dir
LOG_FILE="deployment-logs/rollback_${ENV}_$(date +%Y%m%d_%H%M%S).log"

log_info "Starting rollback process..." | tee "$LOG_FILE"

# Step 1: Get database connection string
log_info "Preparing database connection..." | tee -a "$LOG_FILE"

# Note: This requires database connection details from environment
# For Supabase, we'll use the db reset approach with local migration files

log_warning "IMPORTANT: Manual rollback steps required" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
log_info "Automated schema restoration via CLI has limitations." | tee -a "$LOG_FILE"
log_info "Follow these manual steps:" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
echo "1. Go to Supabase Dashboard for your $ENV project" | tee -a "$LOG_FILE"
echo "2. Navigate to: Database > SQL Editor" | tee -a "$LOG_FILE"
echo "3. Create a new query" | tee -a "$LOG_FILE"
echo "4. Copy and execute the schema from: $BACKUP_DIR/schema.sql" | tee -a "$LOG_FILE"
echo "5. Then execute the data from: $BACKUP_DIR/data.sql" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
log_warning "ALTERNATIVE: Point-in-time recovery via Supabase Dashboard" | tee -a "$LOG_FILE"
echo "1. Go to: Database > Backups" | tee -a "$LOG_FILE"
echo "2. Find the backup timestamp matching: $BACKUP_DIR/metadata.json" | tee -a "$LOG_FILE"
echo "3. Use 'Restore' feature for point-in-time recovery" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

log_info "Backup files location: $BACKUP_DIR" | tee -a "$LOG_FILE"
log_info "Log file: $LOG_FILE" | tee -a "$LOG_FILE"

# For migration-based rollback
echo "" | tee -a "$LOG_FILE"
log_info "MIGRATION ROLLBACK OPTION:" | tee -a "$LOG_FILE"
echo "If you want to rollback specific migrations:" | tee -a "$LOG_FILE"
echo "1. Review migration_history.txt in the backup" | tee -a "$LOG_FILE"
echo "2. Identify the migrations to revert" | tee -a "$LOG_FILE"
echo "3. Create 'down' migration files to undo changes" | tee -a "$LOG_FILE"
echo "4. Apply the down migrations using deploy-migrations.sh" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

log_success "Rollback preparation complete. Follow the steps above." | tee -a "$LOG_FILE"
