# Database Deployment Guide: QA to Production

This guide explains how to deploy database changes from your QA environment to production safely.

## Overview

The deployment system uses Supabase CLI with automated scripts to:
- Track and apply database migrations
- Create automatic backups before deployments
- Support rollback procedures
- Verify migration status across environments

## Prerequisites

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Supabase Projects

Edit the configuration files with your project IDs:

**`.supabase-qa.toml`** - Update with your QA project ID:
```toml
project_id = "your-qa-project-id"
```

**`.supabase-prod.toml`** - Update with your production project ID:
```toml
project_id = "your-prod-project-id"
```

### 3. Set Up Access Token

Get your Supabase access token from: https://app.supabase.com/account/tokens

Set it as an environment variable:

```bash
export SUPABASE_ACCESS_TOKEN="your-access-token"
```

Add this to your shell profile (.bashrc, .zshrc, etc.) to persist across sessions.

## Workflow

### Step 1: Create a New Migration

```bash
npm run db:migration:new "description_of_changes"
```

This creates a new timestamped migration file in `supabase/migrations/`.

Edit the generated file to add your SQL changes. Follow the template provided.

### Step 2: Test in QA

Apply the migration to QA first:

```bash
npx supabase db push --config .supabase-qa.toml
```

Test thoroughly:
- Verify schema changes
- Test application functionality
- Confirm RLS policies work correctly
- Run any data validations

### Step 3: Verify Migration Status

Check the status across environments:

```bash
npm run db:migration:verify
```

This shows which migrations are applied in QA vs production.

### Step 4: Dry Run for Production

Preview what will be deployed to production:

```bash
npm run db:deploy:dry-run
```

Review the pending migrations and their contents carefully.

### Step 5: Deploy to Production

When ready to deploy:

```bash
npm run db:deploy:prod
```

This will:
1. Show pending migrations
2. Ask for confirmation
3. Create automatic backup of production
4. Apply migrations to production
5. Verify the deployment
6. Save deployment logs

**Important:** This process requires manual confirmation at each step for safety.

## Backup and Rollback

### Manual Backup

Create a backup anytime:

```bash
# QA backup
npm run db:backup:qa

# Production backup
npm run db:backup:prod
```

Backups are stored in `deployment-backups/` with timestamps.

### Rollback Process

If something goes wrong, use the rollback script:

```bash
# Rollback to latest backup
npm run db:rollback:prod

# Rollback to specific backup
bash scripts/rollback.sh prod deployment-backups/prod_20260404_120000
```

**Note:** The rollback script provides instructions for manual restoration via Supabase Dashboard or point-in-time recovery.

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run db:migration:new "name"` | Create a new migration file |
| `npm run db:migration:verify` | Check migration status across environments |
| `npm run db:backup:qa` | Backup QA database |
| `npm run db:backup:prod` | Backup production database |
| `npm run db:deploy:dry-run` | Preview production deployment |
| `npm run db:deploy:prod` | Deploy migrations to production |
| `npm run db:rollback:qa` | Rollback QA database |
| `npm run db:rollback:prod` | Rollback production database |

## Best Practices

### 1. Migration Development

- Always test migrations in QA first
- Keep migrations small and focused
- Include descriptive comments in migration files
- Use `IF EXISTS` / `IF NOT EXISTS` clauses for safety
- Never skip RLS policies for new tables

### 2. Deployment Process

- Deploy during low-traffic periods
- Review dry-run output carefully
- Keep team informed of deployments
- Monitor application after deployment
- Have rollback plan ready

### 3. Backup Strategy

- Automatic backups are created before each production deployment
- Manual backups are recommended before major changes
- Keep at least 7 days of backups
- Test restore procedures periodically

### 4. Version Control

- Commit migration files to Git after QA testing
- Never modify already-applied migrations
- Use descriptive migration names
- Tag releases that include database changes

## Troubleshooting

### Connection Issues

If you get connection errors:

1. Check your `SUPABASE_ACCESS_TOKEN` is set
2. Verify project IDs in config files
3. Ensure you have access to both projects
4. Check network connectivity

### Migration Conflicts

If migrations are out of sync:

1. Run `npm run db:migration:verify` to see status
2. Check migration files in `supabase/migrations/`
3. Ensure all migrations are committed to Git
4. Manually verify migration history in Supabase Dashboard

### Failed Deployment

If deployment fails:

1. Check deployment logs in `deployment-logs/`
2. Review error messages carefully
3. Verify migration syntax is valid
4. Use rollback if necessary
5. Fix issues and retry

## Emergency Procedures

### Critical Failure

If production is down after deployment:

1. Assess the severity and impact
2. Check `deployment-logs/` for error details
3. Use Supabase Dashboard for point-in-time recovery
4. Or restore from latest backup using rollback script
5. Document the incident and root cause

### Point-in-Time Recovery

Via Supabase Dashboard:

1. Go to Database > Backups
2. Select the time before the issue
3. Use "Restore" feature
4. Verify restoration
5. Update team

## Directory Structure

```
project/
├── scripts/
│   ├── utils.sh                  # Shared utilities
│   ├── create-migration.sh       # Create new migration
│   ├── verify-migrations.sh      # Check migration status
│   ├── backup-db.sh              # Backup database
│   ├── deploy-migrations.sh      # Deploy to production
│   └── rollback.sh               # Rollback database
├── supabase/
│   └── migrations/               # Migration files
├── deployment-backups/           # Automatic backups (not in Git)
├── deployment-logs/              # Deployment logs (not in Git)
├── .supabase-qa.toml             # QA configuration
└── .supabase-prod.toml           # Production configuration
```

## Support

For issues or questions:
1. Check deployment logs in `deployment-logs/`
2. Review Supabase Dashboard for database status
3. Consult Supabase documentation: https://supabase.com/docs
4. Check migration file syntax and comments

## Security Notes

- Never commit `.env` files or access tokens
- Restrict access to production credentials
- Use RLS policies for all tables
- Audit migration files before deployment
- Keep backups secure and encrypted
