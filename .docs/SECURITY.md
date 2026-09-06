# Security Documentation

This document covers security practices, secret management, and rotation procedures for Perspectize.

## Overview

Perspectize implements multiple security layers:
- **Authentication:** JWT-based with httpOnly cookies (Plan 09-01)
- **Authorization:** Directive-based ownership checks (Plan 09-02)
- **API Protection:** Rate limiting, query complexity, CORS, CSRF (Plan 09-03)
- **HTTP Security:** Security headers, CSP, HTTPS (Plan 09-04)
- **Error Sanitization:** API key protection in logs (Plan 09-05)

## Secret Management

### JWT Secret

**Generation:**
```bash
# Generate 64-byte random secret (recommended)
openssl rand -base64 64

# Minimum 32 bytes for HS256 security
openssl rand -base64 32
```

**Storage:**
- **Development:** `.env` file (gitignored)
- **Production (Sevalla):** Environment variables in Sevalla dashboard
- **Never:** Commit to git, hardcode in config files, share via email/chat

**Validation:**
- Backend validates JWT_SECRET >=32 bytes at startup
- Production fails fast if secret too short
- Development logs warning only

### YouTube API Key

**Source:** Google Cloud Console > YouTube Data API v3 > Credentials

**Storage:**
- Store in `YOUTUBE_API_KEY` environment variable
- Never log the key value (error sanitization in Plan 09-05)
- Rotate if suspected compromise

**Restrictions:**
- API key restrictions: HTTP referrers (frontend domain) or IP addresses (backend IP)
- API restrictions: YouTube Data API v3 only
- Quota monitoring: Track daily quota usage in Google Cloud Console

### Database Credentials

**Storage:**
- `DATABASE_URL` connection string format: `postgres://user:pass@host:5432/dbname`
- Sevalla provides PostgreSQL connection string automatically
- Credentials sanitized in all log output (Plan 07-02)

**Access Control:**
- Use separate database users for app vs admin
- App user: SELECT, INSERT, UPDATE, DELETE only
- Admin user: CREATE, DROP, ALTER for migrations
- Never use superuser for app connections

### Local secret access for AI agents

Claude Code (and any agent working in this repo) must never see real secret
values. Enforcement:

- **`.env*` files are unreadable**, except `.env.example` / `.env.test`, which
  contain variable names and comments only.
  - Read tool: `permissions.deny` rules in `.claude/settings.json`.
  - Bash: `.claude/hooks/deny-env-read.sh` (PreToolUse) blocks any command that
    references a protected `.env` file unless it is a safe metadata/lifecycle op
    (`test`, `ls`, `stat`, `rm`, `git`, `cp SRC .env`, …). It is deny-by-default,
    so an unusual read path is blocked rather than missed.
- **`.env.example` is the source of truth** for which variables exist. Copy it to
  `.env` and fill in real values by hand. Never paste a real value into
  `.env.example` or any committed file.
- **Secret-shaped test fixtures must be generated at runtime**, never hard-coded
  — a literal like `whsec_…` / `sk_…` in source trips GitHub secret scanning
  (see alert #1). Example: `webhook_handler_test.go` builds its svix secret from
  `crypto/rand` per run.
- **Self-verify runs as a real user without credentials**: `.claude/scripts/sv-chrome.sh`
  launches Chrome against a persistent, pre-authenticated profile
  (`.claude/sv-profile/`, gitignored + deny-listed). A human signs in once as a
  dedicated throwaway test user; the agent only ever drives the already-logged-in
  browser. See `.docs/VERIFICATION.md` §0.

## Secret Rotation

### JWT Secret Rotation

**When to rotate:**
- Every 90 days (recommended)
- Immediately if suspected compromise
- After team member departure with access

**Procedure:**
1. Generate new secret: `openssl rand -base64 64`
2. Update `JWT_SECRET` in Sevalla environment variables
3. Restart backend service
4. All existing tokens invalidated (users must re-authenticate)
5. Log rotation event with timestamp

**Zero-downtime rotation (advanced):**
- Requires dual-secret support (validate with old OR new secret for grace period)
- Not implemented in Phase 9 (manual rotation acceptable for initial security)

### YouTube API Key Rotation

**When to rotate:**
- Annually (recommended)
- Immediately if key appears in logs/errors (despite sanitization)
- After security incident

**Procedure:**
1. Create new API key in Google Cloud Console with same restrictions
2. Update `YOUTUBE_API_KEY` in Sevalla environment variables
3. Test backend with new key (create test video)
4. Delete old key in Google Cloud Console
5. Monitor for API errors in first 24 hours

### Database Credentials Rotation

**When to rotate:**
- Every 90 days (recommended)
- After security incident
- Never rotate during high-traffic periods

**Procedure (Sevalla PostgreSQL):**
1. Sevalla handles credential rotation automatically
2. Monitor for `DATABASE_URL` env var changes in dashboard
3. Backend reconnects automatically on connection pool refresh
4. No manual action required

## Sevalla-Specific Practices

### Environment Variables

**Setting secrets:**
1. Sevalla Dashboard > Your App > Settings > Environment Variables
2. Add variables: `JWT_SECRET`, `YOUTUBE_API_KEY`, `CORS_ORIGINS`
3. Click "Restart" after saving changes
4. Verify via app logs that new secrets loaded

**Production checklist:**
- [ ] `APP_ENV=production` set
- [ ] `JWT_SECRET` >=64 bytes
- [ ] `YOUTUBE_API_KEY` with API restrictions
- [ ] `CORS_ORIGINS=https://app.perspectize.com` (no wildcard)
- [ ] `RATE_LIMIT_PER_MIN=100` or appropriate for traffic
- [ ] `DATABASE_URL` provided by Sevalla automatically

### HTTPS/TLS

**Handled by Sevalla:**
- Free SSL certificates via Cloudflare integration
- Automatic renewal
- TLS 1.2/1.3 support
- HSTS headers set by backend (Plan 09-04)

**Verification:**
```bash
curl -I https://api.perspectize.com
# Should return 200 with Strict-Transport-Security header
```

## Security Incident Response

### Suspected JWT Secret Compromise

1. Immediately rotate JWT_SECRET (see rotation procedure)
2. Review recent access logs for suspicious activity
3. Check Sevalla access logs for unauthorized environment variable changes
4. Notify users of forced logout (all tokens invalidated)
5. Document incident with timeline

### API Key Exposure

1. Immediately delete exposed key in Google Cloud Console
2. Create new key with same restrictions
3. Update `YOUTUBE_API_KEY` in Sevalla
4. Review quota usage for abuse
5. Check backend logs for unauthorized API calls
6. Document incident and update error sanitization if needed

### Database Breach

1. Contact Sevalla support immediately
2. Rotate database credentials via Sevalla dashboard
3. Review database audit logs (if available)
4. Force all users to reset passwords (if user authentication implemented)
5. Incident response team meeting
6. Post-mortem documentation

## Monitoring

### Logs to Monitor

- **Auth failures:** `"access denied"` in GraphQL responses (rate spike = attack)
- **Rate limiting:** `"rate limit exceeded"` (sustained = possible DoS)
- **API errors:** YouTube API errors (quota exceeded, invalid key)
- **Database errors:** Connection failures (credentials issue, network issue)
- **Secret validation:** `"JWT_SECRET too short"` warnings

### Alerts to Configure

- Rate limit exceeded >10 times/minute
- YouTube API quota >80% consumed
- Database connection pool exhausted
- 5xx errors >5% of requests
- HTTPS certificate expiring <30 days (Sevalla auto-renews)

## References

- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [Sevalla Environment Variables](https://docs.sevalla.com/)
- [Google Cloud API Key Best Practices](https://cloud.google.com/docs/authentication/api-keys)
- Phase 9 Plans: 09-01 through 09-06 in `.planning/phases/09-security-hardening/`
