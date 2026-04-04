#!/bin/bash

# Utility functions for deployment scripts

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required environment variables are set
check_env_vars() {
    if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
        log_error "SUPABASE_ACCESS_TOKEN environment variable is not set"
        log_info "Get your token from: https://app.supabase.com/account/tokens"
        return 1
    fi
    return 0
}

# Check if Supabase CLI is installed
check_supabase_cli() {
    if ! command -v npx supabase &> /dev/null; then
        log_error "Supabase CLI is not available"
        log_info "Install it with: npm install --save-dev supabase"
        return 1
    fi
    return 0
}

# Create backup directory with timestamp
create_backup_dir() {
    local env=$1
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_dir="deployment-backups/${env}_${timestamp}"
    mkdir -p "$backup_dir"
    echo "$backup_dir"
}

# Create log directory
create_log_dir() {
    mkdir -p deployment-logs
}

# Log command output to file
log_to_file() {
    local log_file=$1
    shift
    "$@" 2>&1 | tee -a "$log_file"
    return ${PIPESTATUS[0]}
}

# Confirm action with user
confirm_action() {
    local message=$1
    echo -e "${YELLOW}$message${NC}"
    read -p "Continue? (yes/no): " response
    if [[ "$response" != "yes" ]]; then
        log_info "Operation cancelled by user"
        return 1
    fi
    return 0
}

# Get list of pending migrations
get_pending_migrations() {
    local config_file=$1
    npx supabase migration list --config "$config_file" 2>/dev/null | grep "Not applied" | awk '{print $1}'
}

# Get list of applied migrations
get_applied_migrations() {
    local config_file=$1
    npx supabase migration list --config "$config_file" 2>/dev/null | grep "Applied" | awk '{print $1}'
}

# Export current database schema
export_schema() {
    local config_file=$1
    local output_file=$2
    npx supabase db dump --config "$config_file" --schema public > "$output_file"
}

# Wait for user confirmation
wait_for_confirmation() {
    read -p "Press Enter to continue..."
}
