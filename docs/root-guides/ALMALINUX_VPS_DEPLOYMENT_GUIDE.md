# AlmaLinux VPS Deployment Guide for Lancelot

## Prerequisites

- AlmaLinux 8 or 9 VPS from Namecheap
- Root SSH access
- Domain name pointed to your VPS IP

## Initial Server Setup

### 1. Connect to Your VPS

```bash
ssh root@your-vps-ip
```

### 2. Update System Packages

```bash
dnf update -y
dnf install -y epel-release
dnf install -y dnf-utils
```

### 3. Install Essential Tools

```bash
dnf install -y git wget curl nano vim htop
```

## Install Docker and Docker Compose

### 1. Install Docker

```bash
# Add Docker repository
dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

# Install Docker
dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Start and enable Docker
systemctl start docker
systemctl enable docker

# Verify installation
docker --version
```

### 2. Install Docker Compose

```bash
# Download Docker Compose
curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

# Make it executable
chmod +x /usr/local/bin/docker-compose

# Create symbolic link
ln -s /usr/local/bin/docker-compose /usr/bin/docker-compose

# Verify installation
docker-compose --version
```

## Configure Firewall

```bash
# Install firewalld if not already installed
dnf install -y firewalld

# Start firewalld
systemctl start firewalld
systemctl enable firewalld

# Open necessary ports
firewall-cmd --permanent --add-port=80/tcp    # HTTP
firewall-cmd --permanent --add-port=443/tcp   # HTTPS
firewall-cmd --permanent --add-port=3000/tcp  # Next.js (temporary for testing)
firewall-cmd --permanent --add-port=4000/tcp  # GraphQL API (temporary for testing)
firewall-cmd --permanent --add-port=27017/tcp # MongoDB (only if external access needed)

# Reload firewall
firewall-cmd --reload

# List open ports
firewall-cmd --list-ports
```

## Deploy Lancelot Application

### 1. Create Application Directory

```bash
mkdir -p /opt/lancelot
cd /opt/lancelot
```

### 2. Clone Repository

```bash
# If using Git with SSH
git clone git@github.com:your-username/lancelot2.git .

# Or using HTTPS
git clone https://github.com/your-username/lancelot2.git .
```

### 3. Set Up Environment Variables

```bash
# Copy example env file
cp env.production.example .env

# Edit environment variables
nano .env
```

Update the .env file with:
```env
# Environment
NODE_ENV=production

# MongoDB - Using Docker MongoDB
MONGODB_URL=mongodb://<USER>:<PASSWORD>@mongodb:27017/lancelot?authSource=admin
MONGO_USERNAME=<your-username>
MONGO_PASSWORD=<your-password>

# API Configuration
API_PORT=4000
JWT_SECRET=your-super-secure-jwt-secret-min-64-chars-generate-random

# Frontend Configuration
NEXT_PUBLIC_GRAPHQL_URL=https://api.yourdomain.com/graphql
NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com/graphql

# CORS
CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com

# Features
ENABLE_GRAPHQL_PLAYGROUND=false
ENABLE_GRAPHQL_INTROSPECTION=false
```

### 4. Build and Start Services

```bash
# Build images (if needed)
docker-compose build

# Start all services
docker-compose up -d

# Check running containers
docker ps

# View logs
docker-compose logs -f
```

## Install and Configure Nginx as Reverse Proxy

### 1. Install Nginx

```bash
dnf install -y nginx

# Start and enable Nginx
systemctl start nginx
systemctl enable nginx
```

### 2. Configure Nginx for Your Domain

Create main domain configuration:
```bash
nano /etc/nginx/conf.d/lancelot.conf
```

Add the following configuration:
```nginx
# Main frontend application
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# API subdomain
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support for GraphQL subscriptions
    location /graphql {
        proxy_pass http://localhost:4000/graphql;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 3. Test and Reload Nginx

```bash
# Test configuration
nginx -t

# Reload Nginx
systemctl reload nginx
```

## Install SSL Certificates with Let's Encrypt

### 1. Install Certbot

```bash
dnf install -y certbot python3-certbot-nginx
```

### 2. Obtain SSL Certificates

```bash
# For main domain
certbot --nginx -d yourdomain.com -d www.yourdomain.com

# For API subdomain
certbot --nginx -d api.yourdomain.com
```

### 3. Auto-renewal Setup

```bash
# Test renewal
certbot renew --dry-run

# Certbot automatically sets up a cron job for renewal
systemctl list-timers | grep certbot
```

## SELinux Configuration (if enabled)

```bash
# Check if SELinux is enabled
getenforce

# If enabled, allow Nginx to connect to backend
setsebool -P httpd_can_network_connect 1
```

## Monitoring and Maintenance

### 1. Install Docker Monitoring

```bash
# Install ctop for container monitoring
wget https://github.com/bcicen/ctop/releases/download/v0.7.7/ctop-0.7.7-linux-amd64 -O /usr/local/bin/ctop
chmod +x /usr/local/bin/ctop
```

### 2. Set Up Log Rotation

Docker logs are automatically rotated, but you can configure it in docker-compose.yml:

```yaml
services:
  mongodb:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### 3. Backup MongoDB

Create a backup script:
```bash
nano /opt/lancelot/backup-mongodb.sh
```

Add:
```bash
#!/bin/bash
BACKUP_DIR="/opt/lancelot/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Backup MongoDB (read credentials from environment, e.g. /etc/lancelot.env)
docker-compose exec -T mongodb mongodump \
  --username="$MONGO_USERNAME" \
  --password="$MONGO_PASSWORD" \
  --authenticationDatabase=admin \
  --archive=/backup/mongodb_$DATE.gz \
  --gzip

# Keep only last 7 days of backups
find $BACKUP_DIR -name "mongodb_*.gz" -mtime +7 -delete
```

Make it executable and add to cron:
```bash
chmod +x /opt/lancelot/backup-mongodb.sh

# Add to crontab (daily at 2 AM)
echo "0 2 * * * /opt/lancelot/backup-mongodb.sh" | crontab -
```

## Security Hardening

### 1. Create Non-Root User

```bash
# Create user
useradd -m -s /bin/bash lancelot
usermod -aG docker lancelot

# Set password
passwd lancelot

# Add to sudoers
echo "lancelot ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/lancelot
```

### 2. SSH Hardening

```bash
# Edit SSH config
nano /etc/ssh/sshd_config

# Recommended settings:
# PermitRootLogin no
# PasswordAuthentication no
# PubkeyAuthentication yes

# Restart SSH
systemctl restart sshd
```

### 3. Install Fail2ban

```bash
dnf install -y fail2ban

# Start and enable
systemctl start fail2ban
systemctl enable fail2ban
```

## Useful Commands

```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f mongodb
docker-compose logs -f api-gateway
docker-compose logs -f web

# Restart services
docker-compose restart

# Stop services
docker-compose down

# Start services
docker-compose up -d

# Update application
git pull
docker-compose down
docker-compose up -d --build

# Check disk usage
df -h

# Check memory usage
free -m

# Monitor containers
ctop
```

## Troubleshooting

### MongoDB Connection Issues
```bash
# Check MongoDB logs
docker-compose logs mongodb

# Test MongoDB connection
docker-compose exec mongodb mongosh -u "$MONGO_USERNAME" -p "$MONGO_PASSWORD" --authenticationDatabase admin
```

### Permission Issues
```bash
# Fix permissions
chown -R lancelot:lancelot /opt/lancelot
```

### Port Conflicts
```bash
# Check what's using a port
ss -tlnp | grep :3000
```

## Next Steps

1. Set up monitoring (Prometheus/Grafana)
2. Configure email server for notifications
3. Set up CI/CD pipeline
4. Configure CDN for static assets
5. Implement backup strategy

---

Your Lancelot application is now running on AlmaLinux VPS with:
- ✅ MongoDB running in Docker
- ✅ Full WebSocket support
- ✅ SSL certificates
- ✅ Nginx reverse proxy
- ✅ Automatic backups
- ✅ Security hardening
