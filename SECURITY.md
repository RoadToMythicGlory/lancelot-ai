# Security Policy

Lancelot runs inside broadcast facilities, often next to playout and routing hardware.
We take reports seriously and appreciate responsible disclosure.

## Supported versions

| Branch | Supported |
|---|---|
| `main` | ✅ |
| anything else | ❌ |

## Reporting a vulnerability

**Please do not open a public issue.** Use GitHub's private reporting:
**Security → Report a vulnerability** on this repository. You'll get an acknowledgement
within 72 hours and a fix or mitigation plan within 14 days for confirmed issues.

Include: affected component (web / api-gateway / ai-agent / excel-parser / solver),
reproduction steps, impact, and any suggested fix.

## Hardening checklist for operators

- Generate `JWT_SECRET`, `SESSION_SECRET` and `CSRF_SECRET` with `openssl rand -base64 64`; rotate with `JWT_SECRET_PREVIOUS`.
- Run MongoDB with authentication and bind it to the internal network only.
- Put the API gateway behind TLS (see `nginx-example.conf`) and set a strict `CORS_ALLOWED_ORIGINS`.
- Enable Redis-backed rate limiting in production (`REDIS_URL`).
- Change every seeded password before exposing an instance; seeds ship with `CHANGE_ME*` placeholders on purpose.
- Keep Vizrt / routing integrations backend-only — the browser never talks to them directly.
- `scripts/ops/lancelot-watchdog.sh` provides integrity sweeps and Telegram alerts for VPS deployments.

## What is out of scope

- Issues requiring physical access to the host
- Vulnerabilities in third-party dependencies already reported upstream (please still tell us so we can bump)
