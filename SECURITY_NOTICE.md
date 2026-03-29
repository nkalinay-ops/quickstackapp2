# Security Notice - Credential Rotation Required

## Critical: Exposed Credentials

The following credentials were previously committed to version control and **MUST be rotated immediately**:

### 1. OpenAI API Key
- **Status**: EXPOSED - Rotate immediately
- **Action Required**:
  1. Go to https://platform.openai.com/api-keys
  2. Revoke the exposed key
  3. Generate a new API key
  4. Update your local .env file with the new key

### 2. Supabase Credentials
- **Status**: Anon key is public by design, but review project security
- **Action Required**:
  1. Review your Supabase project's Row Level Security (RLS) policies
  2. Ensure all tables have proper RLS enabled
  3. Consider regenerating the anon key if concerned about abuse
  4. Review API usage logs for any suspicious activity

## Next Steps

1. **Rotate all exposed credentials immediately**
2. **Update your local .env file** (use .env.example as a template)
3. **Never commit .env files** - they are already in .gitignore
4. **Review Supabase billing** to check for unexpected API usage
5. **Monitor OpenAI usage** at https://platform.openai.com/usage

## Prevention

- The .env file is now properly excluded from version control
- Always use .env.example as a template for required environment variables
- Never commit actual API keys or secrets to the repository
