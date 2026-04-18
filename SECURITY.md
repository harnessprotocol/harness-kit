# Security Policy

## Reporting Security Issues

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in harness-kit, please report it through [GitHub Security Advisories](https://github.com/harnessprotocol/harness-kit/security/advisories/new) or email [security@harnesskit.ai](mailto:security@harnesskit.ai). Include the following information:

- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact
- Suggested remediation (if any)

**Expected Response Time:** We aim to acknowledge security reports within 48 hours and provide an initial assessment within 5 business days.

### Security Updates

Security updates will be released as patch versions and documented in the [GitHub Security Advisories](https://github.com/harnessprotocol/harness-kit/security/advisories) section.

## Security Model

### Architecture Overview

harness-kit is a plugin marketplace and configuration system for AI coding tools. The project consists of:

1. **Plugins** - Installable skills, agents, and scripts distributed through the marketplace
2. **Marketplace App** - Next.js web application for browsing and discovering plugins
3. **Board Server** - WebSocket server for real-time kanban board features
4. **Desktop App** - Tauri-based desktop application with React frontend and Rust backend
5. **CLI Tools** - Command-line utilities for harness management

### Trust Boundaries

- **Plugin Code Execution**: Plugins execute with the same permissions as Claude Code. Users should review plugin code before installation.
- **Web Services**: The marketplace app and board-server expose HTTP/WebSocket endpoints. These services should be deployed with appropriate network isolation.
- **Desktop App**: The Tauri desktop app has access to local filesystem and system APIs through its Rust backend.

### Authentication & Authorization

- **Supabase Integration**: The marketplace app uses Supabase for authentication and data persistence. Row-level security (RLS) policies control data access.
- **Board Server**: Currently designed for local development use. Production deployments should implement authentication and authorization appropriate to their threat model.
- **Plugin Permissions**: Plugins inherit the execution context of Claude Code and have access to the local filesystem within the project directory.

## Secrets Management

### Environment Variables

Sensitive configuration values should NEVER be committed to version control. Use `.env` files for local development and environment-specific secret management for production.

**For Local Development:**
1. Copy `.env.example` to `.env` in the relevant service directory
2. Fill in your credentials (never commit the `.env` file)
3. Ensure `.env` is in `.gitignore`

**Required Secrets by Service:**

**Marketplace (`apps/marketplace/`):**
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL (public, but project-specific)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key (public, rate-limited)
- `SUPABASE_SERVICE_ROLE_KEY` - Server-side Supabase key (PRIVATE, keep secret)
- `SUPABASE_URL` - Supabase URL for seed scripts (PRIVATE)
- `REGISTER_API_KEY` - API key protecting the /api/register endpoint (PRIVATE, keep secret)
- `GITHUB_TOKEN` - GitHub personal access token for sync operations (PRIVATE, optional)
- `GITHUB_WEBHOOK_SECRET` - GitHub webhook secret (PRIVATE, keep secret)

**Board Server (`packages/board-server/`):**
- `BOARD_PORT` - WebSocket server port (default: 4800)

### Secret Rotation

- **Supabase Keys**: Rotate through Supabase project settings. Update environment variables in all deployment environments.
- **Database Credentials**: Rotate through your database provider. Update `DATABASE_URL` in all environments.
- **API Keys**: Any third-party API keys should be rotated according to the provider's recommendations.

### Best Practices

- Use environment-specific secrets management (e.g., GitHub Secrets, Vercel Environment Variables, AWS Secrets Manager)
- Never log secrets or include them in error messages
- Use `.env.example` files to document required variables without including real values
- Limit secret access to the minimum required scope (e.g., use Supabase anon key for client-side, service role key only for server operations)

## Deployment Security

### Production Checklist

Before deploying harness-kit services to production:

- [ ] All secrets are stored in a secure secrets management system (not in code or config files)
- [ ] `.env` files are excluded from version control (verify `.gitignore`)
- [ ] CORS is configured to allow only trusted origins
- [ ] Supabase Row Level Security (RLS) policies are enabled and tested
- [ ] HTTPS/TLS is enabled for all web services
- [ ] WebSocket connections use WSS (secure WebSocket)
- [ ] Database connection strings use SSL/TLS
- [ ] Rate limiting is configured for public API endpoints
- [ ] Logging is configured to exclude sensitive data
- [ ] Security headers are configured (CSP, HSTS, X-Frame-Options, etc.)

### Marketplace App (`apps/marketplace/`)

- Deploy on a platform with built-in DDoS protection (e.g., Vercel, Cloudflare)
- Configure Content Security Policy (CSP) headers
- Enable Supabase RLS policies for all tables
- Use `NEXT_PUBLIC_` prefix only for truly public variables
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client

### Board Server (`packages/board-server/`)

- Run behind a reverse proxy (nginx, Caddy) with TLS termination
- Implement authentication before production use
- Configure CORS to whitelist specific origins only
- Set reasonable rate limits on WebSocket connections
- Monitor for abnormal connection patterns

### Desktop App (`apps/desktop/`)

- Code-sign the application for distribution
- Keep Tauri and dependencies up to date
- Follow Tauri security best practices: https://tauri.app/v1/guides/security/
- Validate all IPC commands from the frontend
- Limit filesystem access to necessary directories

## Dependency Management

### Automated Scanning

We use automated dependency scanning to detect known vulnerabilities:

- **Node.js Dependencies**: `pnpm audit` runs in CI for all JavaScript/TypeScript packages
- **Rust Dependencies**: `cargo audit` can be used for the Tauri desktop app (`apps/desktop/src-tauri/`)
- **GitHub Dependabot**: Automatically creates PRs for dependency updates with known security issues

### Audit Thresholds

Our CI pipeline uses the following severity thresholds:

- **Critical**: Immediate action required
- **High**: Address within 7 days
- **Moderate**: Address within 30 days
- **Low**: Address in next planned update

### Dependency Updates

We follow these practices for dependency management:

1. **Regular Updates**: Review and update dependencies monthly
2. **Security Patches**: Apply security patches as soon as possible
3. **Lock Files**: Commit lock files (`pnpm-lock.yaml`, `Cargo.lock`) to ensure reproducible builds
4. **Minimal Dependencies**: Avoid unnecessary dependencies to reduce attack surface
5. **Trusted Sources**: Only use dependencies from trusted registries (npm, crates.io)

### Running Security Audits Locally

**Node.js/TypeScript Projects:**
```bash
# Run audit for all workspace packages
pnpm audit

# Run audit with specific severity threshold
pnpm audit --audit-level=moderate

# Get detailed JSON output
pnpm audit --json
```

**Rust Projects:**
```bash
# Install cargo-audit
cargo install cargo-audit

# Run audit on desktop app
cd apps/desktop/src-tauri
cargo audit
```

### Vulnerability Response

When a vulnerability is discovered:

1. **Assess Impact**: Determine if the vulnerability affects harness-kit's usage of the dependency
2. **Check for Updates**: Look for a patched version of the dependency
3. **Update or Mitigate**: Update to a safe version or implement mitigations if no update is available
4. **Test**: Verify the update doesn't break functionality
5. **Document**: Update changelog and notify users if the vulnerability could affect deployments

### Plugin Security

Since harness-kit is a plugin marketplace, special attention is given to plugin dependencies:

- Plugin authors should follow the same security practices
- Users should review plugin code and dependencies before installation
- Plugins with known vulnerabilities will be flagged in the marketplace
- Plugin updates should be tested before installation

## Supported Versions

We provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |
| 0.x.x   | :white_check_mark: |

We recommend always using the latest stable release.

## Security Tooling

In addition to dependency scanning, we recommend:

- **Static Analysis**: Use TypeScript strict mode and Rust's clippy for code quality
- **Git Hooks**: Use pre-commit hooks to prevent committing secrets (e.g., detect-secrets, git-secrets)
- **Code Review**: All changes should be reviewed before merging
- **Principle of Least Privilege**: Grant minimal necessary permissions to services and users

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Tauri Security Guide](https://tauri.app/v1/guides/security/)
- [Next.js Security Headers](https://nextjs.org/docs/advanced-features/security-headers)
- [Supabase Security](https://supabase.com/docs/guides/auth/security)
- [npm Security Best Practices](https://docs.npmjs.com/security-best-practices)

---

**Last Updated:** 2026-04-18
