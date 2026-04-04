# Setup Instructions

## Deployment System Setup Complete

Your automated deployment system is now configured and ready to use.

## Current Configuration

**Project ID:** `fsqmyefqbjndilrwluep`

Both QA and Production are currently pointing to the same Supabase project. If you have separate QA and production projects, update the `project_id` in `.supabase-prod.toml`.

## Next Steps

### 1. Get Your Supabase Access Token

Visit: https://app.supabase.com/account/tokens

Create a new access token with the following scopes:
- Read access to projects
- Write access to database

### 2. Set Environment Variable

Add to your shell profile (.bashrc, .zshrc, etc.):

```bash
export SUPABASE_ACCESS_TOKEN="your_token_here"
```

Or for current session only:

```bash
export SUPABASE_ACCESS_TOKEN="your_token_here"
```

### 3. Verify Setup

Check that everything is configured correctly:

```bash
npm run db:migration:verify
```

This will show the migration status for both environments.

## Available Commands

Now you can use these commands:

```bash
# Create a new migration
npm run db:migration:new "description"

# Check migration status
npm run db:migration:verify

# Backup databases
npm run db:backup:qa
npm run db:backup:prod

# Deploy to production (preview first)
npm run db:deploy:dry-run
npm run db:deploy:prod

# Rollback if needed
npm run db:rollback:prod
```

## Workflow Example

```bash
# 1. Create new migration
npm run db:migration:new "add_new_feature"

# 2. Edit the file in supabase/migrations/

# 3. Test in QA
npx supabase db push --config .supabase-qa.toml

# 4. Verify changes work in your app

# 5. Preview production deployment
npm run db:deploy:dry-run

# 6. Deploy to production
npm run db:deploy:prod
```

## Documentation

For detailed documentation, see:
- `DEPLOYMENT_GUIDE.md` - Complete deployment workflow
- `scripts/README.md` - Script documentation and examples

## Security Note

The `.env` file contains sensitive keys and is already in `.gitignore`. Never commit credentials to version control.

## Support

If you encounter any issues:
1. Check that `SUPABASE_ACCESS_TOKEN` is set
2. Verify project IDs in `.supabase-*.toml` files
3. Review deployment logs in `deployment-logs/`
4. Consult `DEPLOYMENT_GUIDE.md` for troubleshooting

## Ready to Use

Your deployment system is ready! Start by creating your first migration or verifying the current status.
