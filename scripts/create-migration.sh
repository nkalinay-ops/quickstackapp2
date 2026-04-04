#!/bin/bash

# Create a new migration file
# Usage: ./scripts/create-migration.sh "migration_name"

set -e

# Source utilities
source "$(dirname "$0")/utils.sh"

# Check arguments
if [ $# -ne 1 ]; then
    log_error "Usage: $0 \"migration_name\""
    log_info "Example: $0 \"add_user_preferences_table\""
    exit 1
fi

MIGRATION_NAME=$1

# Check prerequisites
check_supabase_cli || exit 1

log_info "Creating new migration: $MIGRATION_NAME"

# Create migration file with timestamp
TIMESTAMP=$(date +%Y%m%d%H%M%S)
MIGRATION_FILE="supabase/migrations/${TIMESTAMP}_${MIGRATION_NAME}.sql"

# Create the migration file with template
cat > "$MIGRATION_FILE" << 'EOF'
/*
  # Migration Title

  1. Changes
    - Describe what this migration does

  2. Security
    - Describe RLS policies and security changes
*/

-- Your SQL here

EOF

log_success "Migration file created: $MIGRATION_FILE"
log_info "Edit this file to add your database changes"
log_info "Test the migration in QA before deploying to production"
