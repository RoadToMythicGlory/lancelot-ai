# Docker Secrets Management Guide for Lancelot Platform

## Overview

This guide explains how to properly manage secrets in Docker for the Lancelot platform, ensuring sensitive data like passwords and API keys are never exposed in plain text.

## Quick Start

### 1. Create `.env` File

Copy the example environment file and fill in your secrets:

```bash
cp .env.example .env
```

Edit `.env` and replace all `CHANGE_ME` values with strong, unique passwords:

```bash
# Generate strong passwords
openssl rand -base64 32  # For passwords
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"  # For JWT secret
```

### 2. Never Commit Secrets

Add `.env` to your `.gitignore`:

```gitignore
.env
.env.local
.env.production
.env.*.local
```

## Environment Variables Reference

| Variable | Description | Example Generator |
|----------|-------------|-------------------|
| `POSTGRES_PASSWORD` | PostgreSQL database password | `openssl rand -base64 32` |
| `MONGO_PASSWORD` | MongoDB root password | `openssl rand -base64 32` |
| `REDIS_PASSWORD` | Redis authentication password | `openssl rand -base64 32` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | `node -p "require('crypto').randomBytes(48).toString('base64')"` |
| `MINIO_PASSWORD` | MinIO admin password | `openssl rand -base64 32` |
| `KEYCLOAK_ADMIN_PASSWORD` | Keycloak admin password | `openssl rand -base64 32` |
| `GRAFANA_PASSWORD` | Grafana admin password | `openssl rand -base64 32` |
| `OPENSEARCH_PASSWORD` | OpenSearch admin password | `openssl rand -base64 32` |

## Docker Swarm Secrets (Production)

For production deployments using Docker Swarm, use Docker secrets:

### 1. Create Secrets

```bash
# Create secrets from files
echo "your-strong-password" | docker secret create postgres_password -
echo "your-jwt-secret" | docker secret create jwt_secret -

# Or from environment variables
printf ${POSTGRES_PASSWORD} | docker secret create postgres_password -
```

### 2. Update docker-compose.production.yml

```yaml
version: '3.8'

secrets:
  postgres_password:
    external: true
  jwt_secret:
    external: true
  mongo_password:
    external: true

services:
  postgres:
    image: postgres:16-alpine
    secrets:
      - postgres_password
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password
```

### 3. Deploy Stack

```bash
docker stack deploy -c docker-compose.production.yml lancelot
```

## Kubernetes Secrets (Alternative)

If using Kubernetes, create secrets using kubectl:

```bash
# Create secret from literals
kubectl create secret generic lancelot-secrets \
  --from-literal=postgres-password='your-password' \
  --from-literal=jwt-secret='your-jwt-secret'

# Or from env file
kubectl create secret generic lancelot-secrets --from-env-file=.env
```

Then reference in your deployment:

```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: api-gateway
    env:
    - name: POSTGRES_PASSWORD
      valueFrom:
        secretKeyRef:
          name: lancelot-secrets
          key: postgres-password
```

## Security Best Practices

### 1. Password Requirements

- **Length**: Minimum 32 characters for secrets, 16 for passwords
- **Complexity**: Use cryptographically secure random generation
- **Uniqueness**: Never reuse passwords across services
- **Rotation**: Rotate secrets every 90 days

### 2. Secret Generation Scripts

Create a script to generate all secrets at once:

```bash
#!/bin/bash
# generate-secrets.sh

generate_secret() {
  openssl rand -base64 32 | tr -d '\n'
}

cat > .env << EOF
# Database Passwords
POSTGRES_PASSWORD=$(generate_secret)
MONGO_PASSWORD=$(generate_secret)
REDIS_PASSWORD=$(generate_secret)

# Service Passwords
MINIO_PASSWORD=$(generate_secret)
KEYCLOAK_ADMIN_PASSWORD=$(generate_secret)
GRAFANA_PASSWORD=$(generate_secret)
OPENSEARCH_PASSWORD=$(generate_secret)

# JWT Secret (longer for security)
JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')

# API Keys (when needed)
LIVEU_API_KEY=
VMIX_API_KEY=
EOF

echo "Secrets generated in .env file"
```

### 3. Secret Rotation

Implement regular secret rotation:

```bash
# 1. Generate new secret
NEW_JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')

# 2. Update environment variables
JWT_SECRET=$NEW_JWT_SECRET
JWT_SECRET_PREVIOUS=$OLD_JWT_SECRET
JWT_SECRET_VERSION=2
JWT_SECRET_ROTATION_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# 3. Restart services with zero downtime
docker service update --env-add JWT_SECRET=$NEW_JWT_SECRET lancelot_api-gateway
```

### 4. Audit and Monitoring

- Log all secret access attempts
- Monitor for exposed secrets in logs
- Use tools like `git-secrets` to prevent accidental commits
- Regular security audits

## Troubleshooting

### Common Issues

1. **"Missing required environment variable"**
   - Ensure `.env` file exists and is properly formatted
   - Check variable names match exactly

2. **"JWT_SECRET must be at least 32 characters"**
   - Generate a longer secret: `openssl rand -base64 48`

3. **"Authentication failed"**
   - Verify passwords match between services
   - Check for special characters that need escaping

### Verification

Test your configuration:

```bash
# Check if secrets are loaded
docker-compose config

# Verify service connectivity
docker-compose exec api-gateway node -e "console.log(process.env.JWT_SECRET ? 'JWT configured' : 'JWT missing')"
```

## Emergency Procedures

If secrets are compromised:

1. **Immediate Actions**:
   ```bash
   # Stop all services
   docker-compose down
   
   # Generate all new secrets
   ./generate-secrets.sh
   
   # Clear Redis cache
   docker-compose run --rm redis redis-cli FLUSHALL
   
   # Restart with new secrets
   docker-compose up -d
   ```

2. **Post-Incident**:
   - Force all users to re-authenticate
   - Review access logs for suspicious activity
   - Update all API keys and webhooks
   - Document the incident

## Development vs Production

### Development (.env)
- Use `.env` files for convenience
- Weaker passwords acceptable (but still unique)
- Secrets in docker-compose.yml with defaults

### Production
- Use Docker secrets or Kubernetes secrets
- Strong, unique passwords mandatory
- No defaults in configuration files
- Enable secret rotation
- Implement key management service (KMS) if available

## Service-to-Service JWT (AI Agent)

The AI agent needs a JWT to call the API Gateway GraphQL endpoint.

### Generate

```bash
# Ensure the AI user is seeded first
cd services/ai-agent && npm run seed:ai-user

# Generate a long-lived service JWT (365 days)
cd services/api-gateway && npm run generate:service-jwt
```

The script outputs a token. Set it as `AI_AGENT_JWT` in `services/ai-agent/.env`
or in the `ai-agent` environment block in `docker-compose.yml`.

### Rotation Procedure

1. Rotate the `JWT_SECRET` in `services/api-gateway/.env` (set `JWT_SECRET_PREVIOUS` to the old value during the grace period).
2. Re-run `npm run generate:service-jwt` to issue a new AI agent token.
3. Update `AI_AGENT_JWT` in the AI agent environment.
4. Restart the AI agent service.
5. After all old tokens expire, remove `JWT_SECRET_PREVIOUS`.

### Environment Variables

| Variable | Service | Description |
|----------|---------|-------------|
| `AI_AGENT_JWT` | ai-agent | Service JWT for GraphQL calls |
| `API_GATEWAY_GRAPHQL_TOKEN` | ai-agent | Alternative env var (same purpose) |
| `API_GATEWAY_JWT` | ai-agent | Alternative env var (same purpose) |

## Additional Resources

- [Docker Secrets Documentation](https://docs.docker.com/engine/swarm/secrets/)
- [OWASP Secret Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_CheatSheet.html)
- [12-Factor App: Config](https://12factor.net/config) 