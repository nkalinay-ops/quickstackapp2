#!/bin/bash

# Verify migration status across environments
# Usage: ./scripts/verify-migrations.sh

set -e

# Source utilities
source "$(dirname "$0")/utils.sh"

QA_CONFIG=".supabase-qa.toml"
PROD_CONFIG=".supabase-prod.toml"

# Check prerequisites
check_env_vars || exit 1
check_supabase_cli || exit 1

log_info "Verifying migration status across environments..."
echo ""

# Check QA
if [ -f "$QA_CONFIG" ]; then
    log_info "=== QA Environment ==="
    npx supabase migration list --config "$QA_CONFIG" 2>&1 || log_warning "Could not connect to QA"
    echo ""
else
    log_warning "QA config not found: $QA_CONFIG"
fi

# Check Production
if [ -f "$PROD_CONFIG" ]; then
    log_info "=== Production Environment ==="
    npx supabase migration list --config "$PROD_CONFIG" 2>&1 || log_warning "Could not connect to Production"
    echo ""
else
    log_warning "Production config not found: $PROD_CONFIG"
fi

# Check for drift between environments
log_info "Checking for differences..."
QA_PENDING=$(get_pending_migrations "$QA_CONFIG" 2>/dev/null || echo "")
PROD_PENDING=$(get_pending_migrations "$PROD_CONFIG" 2>/dev/null || echo "")

if [ -z "$PROD_PENDING" ]; then
    log_success "Production is up to date with QA"
else
    log_warning "Production has pending migrations:"
    echo "$PROD_PENDING" | while read -r migration; do
        echo "  - $migration"
    done
    echo ""
    log_info "Run './scripts/deploy-migrations.sh --dry-run' to preview changes"
fi
