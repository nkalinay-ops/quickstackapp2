# Deployment Scripts

This directory contains automated scripts for managing database deployments between QA and production environments.

## Quick Reference

### Common Workflows

**1. Create and Deploy a New Migration:**
```bash
# Create migration
npm run db:migration:new "add_user_preferences"

# Edit the file: supabase/migrations/TIMESTAMP_add_user_preferences.sql

# Test in QA
npx supabase db push --config .supabase-qa.toml

# Verify
npm run db:migration:verify

# Deploy to production (dry run first)
npm run db:deploy:dry-run

# Deploy for real
npm run db:deploy:prod
```

**2. Emergency Rollback:**
```bash
# Rollback production to latest backup
npm run db:rollback:prod
```

**3. Manual Backup:**
```bash
# Backup production before major changes
npm run db:backup:prod
```

## Scripts Overview

### `utils.sh`
Shared utility functions used by all scripts:
- Logging functions (colored output)
- Environment validation
- Backup directory management
- User confirmation prompts

### `create-migration.sh`
Creates a new migration file with timestamp and template.

**Usage:**
```bash
./scripts/create-migration.sh "migration_name"
npm run db:migration:new "migration_name"
```

**Example:**
```bash
npm run db:migration:new "add_profile_preferences"
```

### `verify-migrations.sh`
Checks migration status across QA and production environments.

**Usage:**
```bash
./scripts/verify-migrations.sh
npm run db:migration:verify
```

Shows:
- Applied migrations in each environment
- Pending migrations
- Differences between environments

### `backup-db.sh`
Creates a full backup of the specified environment.

**Usage:**
```bash
./scripts/backup-db.sh [qa|prod]
npm run db:backup:qa
npm run db:backup:prod
```

Creates:
- `schema.sql` - Database schema
- `data.sql` - Database data
- `migration_history.txt` - Migration status
- `metadata.json` - Backup information

### `deploy-migrations.sh`
Main deployment script for pushing migrations to production.

**Usage:**
```bash
# Dry run (preview only)
./scripts/deploy-migrations.sh --dry-run
npm run db:deploy:dry-run

# Actual deployment
./scripts/deploy-migrations.sh
npm run db:deploy:prod

# Skip backup (not recommended)
./scripts/deploy-migrations.sh --skip-backup
```

**Process:**
1. Checks pending migrations
2. Shows migration contents
3. Requests confirmation
4. Creates backup (unless skipped)
5. Applies migrations
6. Verifies success
7. Logs everything

### `rollback.sh`
Restores database from a backup.

**Usage:**
```bash
# Use latest backup
./scripts/rollback.sh [qa|prod]
npm run db:rollback:prod

# Use specific backup
./scripts/rollback.sh prod deployment-backups/prod_20260404_120000
```

**Note:** This script provides instructions for manual restoration via Supabase Dashboard since CLI-based restoration has limitations.

## Prerequisites

### Environment Variables

Set your Supabase access token:
```bash
export SUPABASE_ACCESS_TOKEN="your-token-here"
```

Get your token from: https://app.supabase.com/account/tokens

### Configuration Files

Update project IDs in:
- `.supabase-qa.toml` - QA project configuration
- `.supabase-prod.toml` - Production project configuration

### Permissions

All scripts should be executable:
```bash
chmod +x scripts/*.sh
```

## Error Handling

All scripts include error handling:
- Validation of prerequisites
- Confirmation prompts for destructive operations
- Logging to files for troubleshooting
- Colored output for easy reading

## Logging

Logs are stored in:
- `deployment-logs/` - Deployment and rollback logs
- `deployment-backups/` - Database backups

These directories are excluded from Git via `.gitignore`.

## Safety Features

1. **Dry Run Mode**: Preview changes before applying
2. **Automatic Backups**: Created before each production deployment
3. **Confirmation Prompts**: Required for destructive operations
4. **Detailed Logging**: All operations logged for audit trail
5. **Rollback Support**: Easy restoration from backups

## Troubleshooting

### "Command not found: npx"
Install dependencies: `npm install`

### "SUPABASE_ACCESS_TOKEN not set"
Export your access token: `export SUPABASE_ACCESS_TOKEN="your-token"`

### "Configuration file not found"
Update project IDs in `.supabase-qa.toml` and `.supabase-prod.toml`

### "Could not connect to QA/Production"
1. Verify project IDs in config files
2. Check access token is valid
3. Ensure you have project permissions

## Best Practices

1. **Always test in QA first** before deploying to production
2. **Use dry run** to preview production deployments
3. **Never skip backups** unless absolutely necessary
4. **Monitor logs** after each deployment
5. **Keep backups** for at least 7 days
6. **Commit migrations** to Git after QA testing
7. **Deploy during low-traffic** periods
8. **Communicate with team** before production deployments

## Examples

### Example 1: Adding a New Table
```bash
# Create migration
npm run db:migration:new "add_user_settings_table"

# Edit supabase/migrations/TIMESTAMP_add_user_settings_table.sql
# Add SQL for table creation, indexes, RLS policies

# Test in QA
npx supabase db push --config .supabase-qa.toml

# Verify app functionality in QA
# Run tests, check UI, validate data

# Deploy to production
npm run db:deploy:dry-run  # Review changes
npm run db:deploy:prod     # Deploy
```

### Example 2: Emergency Rollback
```bash
# Production issue detected after deployment

# Immediate rollback
npm run db:rollback:prod

# Follow instructions in output for manual restoration
# Or use Supabase Dashboard point-in-time recovery

# Investigate issue in deployment logs
cat deployment-logs/deploy_TIMESTAMP.log

# Fix issue and redeploy when ready
```

### Example 3: Scheduled Maintenance
```bash
# Before maintenance window
npm run db:backup:prod           # Extra backup
npm run db:deploy:dry-run        # Final review

# During maintenance window
npm run db:deploy:prod           # Deploy changes

# After deployment
npm run db:migration:verify      # Verify status
# Monitor application
# Check error logs
```

## Integration with CI/CD

These scripts can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Deploy to Production
  run: |
    export SUPABASE_ACCESS_TOKEN=${{ secrets.SUPABASE_TOKEN }}
    npm run db:deploy:prod
```

**Recommendations for automation:**
- Store access token as secret
- Run dry-run in CI for pull requests
- Require manual approval for production
- Send notifications on success/failure
- Archive logs and backups

## Additional Resources

- Main documentation: `../DEPLOYMENT_GUIDE.md`
- Supabase CLI docs: https://supabase.com/docs/guides/cli
- Migration examples: `../supabase/migrations/`
