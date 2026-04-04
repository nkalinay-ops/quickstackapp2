#!/bin/bash

# Deploy Migrations from QA to Production
# Usage: ./scripts/deploy-migrations.sh [--dry-run] [--skip-backup]

set -e

# Source utilities
source "$(dirname "$0")/utils.sh"

# Parse arguments
DRY_RUN=false
SKIP_BACKUP=false

for arg in "$@"; do
    case $arg in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --skip-backup)
            SKIP_BACKUP=true
            shift
            ;;
        *)
            ;;
    esac
done

QA_CONFIG=".supabase-qa.toml"
PROD_CONFIG=".supabase-prod.toml"

# Check prerequisites
check_env_vars || exit 1
check_supabase_cli || exit 1

# Create log directory
create_log_dir
LOG_FILE="deployment-logs/deploy_$(date +%Y%m%d_%H%M%S).log"

log_info "Starting migration deployment process..." | tee "$LOG_FILE"

# Step 1: Check QA migrations
log_info "Checking QA migration status..." | tee -a "$LOG_FILE"
if [ ! -f "$QA_CONFIG" ]; then
    log_error "QA configuration file not found: $QA_CONFIG" | tee -a "$LOG_FILE"
    exit 1
fi

# Step 2: Check production migrations
log_info "Checking production migration status..." | tee -a "$LOG_FILE"
if [ ! -f "$PROD_CONFIG" ]; then
    log_error "Production configuration file not found: $PROD_CONFIG" | tee -a "$LOG_FILE"
    exit 1
fi

# Step 3: Get pending migrations for production
log_info "Identifying pending migrations for production..." | tee -a "$LOG_FILE"
PENDING_MIGRATIONS=$(get_pending_migrations "$PROD_CONFIG")

if [ -z "$PENDING_MIGRATIONS" ]; then
    log_success "No pending migrations found. Production is up to date!" | tee -a "$LOG_FILE"
    exit 0
fi

echo "" | tee -a "$LOG_FILE"
log_warning "Pending migrations to be applied:" | tee -a "$LOG_FILE"
echo "$PENDING_MIGRATIONS" | while read -r migration; do
    echo "  - $migration" | tee -a "$LOG_FILE"
done
echo "" | tee -a "$LOG_FILE"

# Step 4: Display migration file contents
log_info "Migration file contents:" | tee -a "$LOG_FILE"
echo "$PENDING_MIGRATIONS" | while read -r migration; do
    MIGRATION_FILE="supabase/migrations/${migration}.sql"
    if [ -f "$MIGRATION_FILE" ]; then
        echo "" | tee -a "$LOG_FILE"
        echo "=== $migration ===" | tee -a "$LOG_FILE"
        head -n 30 "$MIGRATION_FILE" | tee -a "$LOG_FILE"
        echo "" | tee -a "$LOG_FILE"
    fi
done

# Dry run mode
if [ "$DRY_RUN" = true ]; then
    log_info "DRY RUN MODE - No changes will be applied" | tee -a "$LOG_FILE"
    log_success "Dry run completed. Review the pending migrations above." | tee -a "$LOG_FILE"
    exit 0
fi

# Step 5: Confirm deployment
echo "" | tee -a "$LOG_FILE"
confirm_action "You are about to apply these migrations to PRODUCTION." || exit 1

# Step 6: Backup production database
if [ "$SKIP_BACKUP" = false ]; then
    log_info "Creating production backup before deployment..." | tee -a "$LOG_FILE"
    ./scripts/backup-db.sh prod | tee -a "$LOG_FILE"
    log_success "Backup completed" | tee -a "$LOG_FILE"
else
    log_warning "Skipping backup (--skip-backup flag used)" | tee -a "$LOG_FILE"
fi

# Step 7: Apply migrations to production
log_info "Applying migrations to production..." | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

if npx supabase db push --config "$PROD_CONFIG" 2>&1 | tee -a "$LOG_FILE"; then
    log_success "Migrations applied successfully!" | tee -a "$LOG_FILE"
else
    log_error "Migration deployment failed!" | tee -a "$LOG_FILE"
    log_error "Check the log file for details: $LOG_FILE" | tee -a "$LOG_FILE"
    log_warning "You may need to rollback. See scripts/rollback.sh" | tee -a "$LOG_FILE"
    exit 1
fi

# Step 8: Verify migration status
log_info "Verifying production migration status..." | tee -a "$LOG_FILE"
npx supabase migration list --config "$PROD_CONFIG" | tee -a "$LOG_FILE"

log_success "Deployment completed successfully!" | tee -a "$LOG_FILE"
log_info "Log file: $LOG_FILE" | tee -a "$LOG_FILE"
