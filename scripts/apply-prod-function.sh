#!/bin/bash

# Apply increment_copy_count_batch Postgres function to production
# Usage: ./scripts/apply-prod-function.sh

set -e

source "$(dirname "$0")/utils.sh"

PROD_CONFIG=".supabase-prod.toml"
MIGRATION_FILE="supabase/migrations/20260523013504_add_increment_copy_count_batch_function.sql"

check_env_vars || exit 1
check_supabase_cli || exit 1

if [ ! -f "$PROD_CONFIG" ]; then
    log_error "Production config not found: $PROD_CONFIG"
    exit 1
fi

if [ ! -f "$MIGRATION_FILE" ]; then
    log_error "Migration file not found: $MIGRATION_FILE"
    exit 1
fi

log_info "Applying increment_copy_count_batch function to production..."
echo ""
cat "$MIGRATION_FILE"
echo ""

confirm_action "You are about to apply the above SQL to PRODUCTION." || exit 1

if npx supabase db push --config "$PROD_CONFIG" 2>&1; then
    log_success "Function applied successfully!"
    log_info "You can now deploy the process-bulk-upload edge function."
else
    log_error "Failed to apply function to production."
    exit 1
fi
