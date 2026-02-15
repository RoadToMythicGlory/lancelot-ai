# Testing Production MongoDB from Local Machine

## Overview
This guide helps you test your production MongoDB connection from your local machine before deploying to the VPS.

## Prerequisites
1. Your VPS MongoDB must be accessible from your local IP
2. MongoDB credentials ready
3. Node.js installed locally

## Step 1: Configure VPS MongoDB for Remote Access

### On your AlmaLinux VPS:
1. Edit MongoDB configuration (`/etc/mongod.conf`):
   ```yaml
   net:
     port: 27017
     bindIp: 0.0.0.0  # Or better: 127.0.0.1,YOUR_VPS_IP,YOUR_LOCAL_IP
   ```

2. Configure firewall to allow your local IP:
   ```bash
   # For firewalld (AlmaLinux default)
   sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="YOUR_LOCAL_IP" port protocol="tcp" port="27017" accept'
   sudo firewall-cmd --reload
   
   # Or if using iptables
   sudo iptables -A INPUT -p tcp -s YOUR_LOCAL_IP --dport 27017 -j ACCEPT
   sudo service iptables save
   ```

3. SELinux considerations (AlmaLinux):
   ```bash
   # Check if SELinux is enforcing
   getenforce
   
   # If needed, allow MongoDB network connections
   sudo setsebool -P mongod_can_network on
   ```

4. Restart MongoDB:
   ```bash
   sudo systemctl restart mongod
   ```

## Step 2: Create Local Test Environment File

Create `.env.production` in `services/api-gateway/`:

```env
# Production MongoDB from local machine
NODE_ENV=production
MONGODB_URL=mongodb://LancelotERP_DB:YOUR_PASSWORD@YOUR_VPS_IP:27017/lancelot?authSource=admin

# Or use individual variables:
MONGO_HOST=YOUR_VPS_IP
MONGO_PORT=27017
MONGO_USERNAME=LancelotERP_DB
MONGO_PASSWORD=YOUR_SECURE_PASSWORD
MONGO_DATABASE=lancelot
```

## Step 3: Test Connection First

Run the connection test:
```bash
cd services/api-gateway
npm run test:production-db
```

Expected output:
```
🔍 Testing Production MongoDB Connection...
📡 Connection URL: mongodb://LancelotERP_DB:****@YOUR_VPS_IP:27017/lancelot?authSource=admin
⏳ Attempting to connect...
✅ Successfully connected to MongoDB!
📊 Database: lancelot
📁 Found X collections:
   - users
   - departments
   ...
👥 Users collection has X documents
✅ User mcr@example.com does not exist yet - ready to seed!
🔐 Testing write permissions...
✅ Write test successful!
🧹 Test document cleaned up
✅ All tests passed! Production MongoDB is ready for seeding.
```

## Step 4: Run the Seed Script

Once the test passes:
```bash
npm run seed:production-mcr
```

## Troubleshooting

### Connection Refused
```
Error: connect ECONNREFUSED YOUR_VPS_IP:27017
```
**Solutions:**
- Check VPS firewall settings
- Verify MongoDB is running: `sudo systemctl status mongod`
- Check MongoDB is listening on external IP: `sudo netstat -tlnp | grep 27017`

### Authentication Failed
```
Error: Authentication failed
```
**Solutions:**
- Verify username/password
- Check user exists in admin database: 
  ```bash
  # On VPS
  mongosh admin
  db.system.users.find({user: "LancelotERP_DB"})
  ```
- Ensure user has correct roles

### Timeout Errors
```
Error: Server selection timed out
```
**Solutions:**
- Check network connectivity: `ping YOUR_VPS_IP`
- Try telnet: `telnet YOUR_VPS_IP 27017`
- Check if port is open: `nmap -p 27017 YOUR_VPS_IP`

## Security Notes

⚠️ **IMPORTANT**: After testing, remember to:
1. Remove your local IP from VPS firewall rules
2. Change MongoDB bind IP back to localhost only (if not needed for production)
3. Delete `.env.production` from your local machine
4. Use VPN for future production access

## Alternative: SSH Tunnel (More Secure)

Instead of opening MongoDB to your IP, use SSH tunnel:

```bash
# Create SSH tunnel
ssh -L 27017:localhost:27017 your-user@YOUR_VPS_IP

# In another terminal, use localhost connection
MONGODB_URL=mongodb://LancelotERP_DB:YOUR_PASSWORD@localhost:27017/lancelot?authSource=admin
```

This way MongoDB never needs to be exposed to external IPs!


