# 🐾 Meow Analytics — 24/7 VM Production Deployment Guide

Deploy Meow Analytics to your Linux Virtual Machine (AWS EC2, DigitalOcean, Hetzner, Linode, GCP, Oracle Cloud, or Home Server) so it runs continuously **24/7 without ever going to sleep, needing a waker, or suffering cold starts**.

---

## Why VM Deployment?

| Feature | Render Free Tier | 24/7 Self-Hosted VM |
| :--- | :--- | :--- |
| **Uptime** | Sleeps after 15 min inactivity | **100% continuous 24/7 uptime** |
| **Waker Required?** | Yes (external cron/UptimeRobot) | **No waker needed** |
| **Cold Starts** | 30–50 second delay on wake-up | **Instant 0 ms response times** |
| **Database Storage** | Ephemeral (requires external DB) | **Persistent local PostgreSQL volume** |
| **Event Ingestion** | Paused when instance spins down | **Immediate real-time batch processing** |
| **Background Scheduler**| Runs only while awake | **Reliable hourly/daily aggregations** |

---

## Architecture on Your VM

```text
               Public Internet / Visitors / Browsers
                                │
                                ▼ Ports 80 & 443
                     ┌─────────────────────┐
                     │    Reverse Proxy    │
                     │  (Nginx or Caddy)   │
                     │  Automatic SSL/TLS  │
                     └──────────┬──────────┘
                                │
               ┌────────────────┴────────────────┐
               ▼                                 ▼
   ┌───────────────────────┐         ┌───────────────────────┐
   │    meow_dashboard     │         │       meow_api        │
   │  (Nginx Static SPA)   │         │ (Fastify Engine :3001)│
   │  - Analytics UI       │         │ - /meow.js Tracker    │
   │  - Port 80            │         │ - /api/v1/collect     │
   └───────────────────────┘         │ - Auto-Scheduler      │
                                     └───────────┬───────────┘
                                                 │
                                                 ▼
                                     ┌───────────────────────┐
                                     │     meow_postgres     │
                                     │   (PostgreSQL 16)     │
                                     │  Persistent Data Vol  │
                                     └───────────────────────┘
```

---

## Prerequisites & Firewall Setup

### 1. VM Hardware Requirements
- **OS**: Ubuntu 22.04/24.04, Debian 12, Rocky Linux, AlmaLinux, or CentOS.
- **RAM**: 1 GB minimum (2 GB recommended).
- **Disk**: 10 GB+ SSD.

### 2. Open Firewall / Security Group Ports
Ensure your cloud provider's firewall allows:
- **Port 22** (SSH access)
- **Port 80** (HTTP / SSL challenge)
- **Port 443** (HTTPS encrypted traffic)

On Ubuntu/Debian (`ufw`):
```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## Method 1: Automated 1-Command Deployment (Recommended)

SSH into your VM and run:

```bash
# 1. Clone the repository
git clone https://github.com/your-username/meow-analytics.git
cd meow-analytics

# 2. Run the deployment wizard
bash scripts/deploy-vm.sh
```

The wizard will:
1. Detect and optionally install Docker & Docker Compose if missing.
2. Auto-generate cryptographically secure production keys (`MEOW_SECRET` and `ADMIN_SECRET`).
3. Offer automated Let's Encrypt HTTPS with Caddy for your domain.
4. Build and start all containers with `restart: unless-stopped`.
5. Run health checks and print your Admin Secret and Dashboard URL.

---

## Method 2: Manual Docker Compose Deployment

If you prefer configuring every setting manually:

### Step 1: Install Docker & Docker Compose
```bash
# Install Docker on Ubuntu / Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# Verify installation
docker --version
docker compose version
```

### Step 2: Clone and Configure Environment
```bash
git clone https://github.com/your-username/meow-analytics.git
cd meow-analytics

# Copy production environment template
cp .env.production.example .env
```

### Step 3: Generate Strong Secrets
Run these commands to generate random secrets:
```bash
# 1. Generate MEOW_SECRET (at least 32 characters)
openssl rand -hex 32

# 2. Generate ADMIN_SECRET (at least 16 characters)
openssl rand -hex 24

# 3. Generate POSTGRES_PASSWORD
openssl rand -hex 16
```

Edit your `.env` file (`nano .env`) and paste the generated secrets:
```ini
NODE_ENV=production
HOST=0.0.0.0
PORT=3001
PORT_HTTP=80

POSTGRES_USER=meow
POSTGRES_PASSWORD=your_generated_postgres_password
POSTGRES_DB=meow_analytics

DATABASE_URL=postgres://meow:your_generated_postgres_password@postgres:5432/meow_analytics

MEOW_SECRET=your_generated_meow_secret_32_characters_minimum
ADMIN_SECRET=your_generated_admin_secret_16_characters_minimum
CORS_ORIGINS=*

LOG_LEVEL=info
ASYNC_INGESTION=true
DATABASE_POOL_MAX=25
```

### Step 4: Build and Launch the Stack
```bash
docker compose up -d --build
```

### Step 5: Verify Running Services
```bash
# Check container status
docker compose ps

# Check API health
curl http://localhost:3001/api/health
# {"status":"ok"}

# Check database readiness
curl http://localhost:3001/api/ready
# {"status":"ready","database":"connected",...}
```

---

## Setting Up HTTPS / SSL (Required for Tracking HTTPS Sites)

> [!IMPORTANT]
> Modern web browsers block non-HTTPS tracking scripts on HTTPS sites (`Mixed Content`). You **must** serve `meow.js` over HTTPS in production.

Choose one of three easy HTTPS options:

### Option A: Built-in Caddy (Zero Configuration — Recommended)
Caddy automatically handles Let's Encrypt certificate acquisition, verification, and renewals.

1. In `.env`, add your domain and email:
   ```ini
   DOMAIN=analytics.yourdomain.com
   CADDY_EMAIL=you@example.com
   ```
2. Point your DNS `A` record for `analytics.yourdomain.com` to your VM's public IP.
3. Launch with Caddy:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d
   ```
Your dashboard is now live at `https://analytics.yourdomain.com` with valid TLS!

---

### Option B: Host Nginx + Certbot
If your VM already runs Nginx on the host machine:

1. Copy the provided Nginx configuration:
   ```bash
   sudo cp deploy/nginx-host.conf /etc/nginx/sites-available/meow-analytics
   sudo nano /etc/nginx/sites-available/meow-analytics
   # Replace analytics.yourdomain.com with your actual domain
   ```
2. Enable site:
   ```bash
   sudo ln -s /etc/nginx/sites-available/meow-analytics /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```
3. Issue free SSL certificate with Certbot:
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d analytics.yourdomain.com
   ```

---

### Option C: Cloudflare Tunnel (No Open Ports Needed)
If your VM is in a home lab or private VPC behind NAT without a public IP:

1. Install `cloudflared`:
   ```bash
   curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
   sudo dpkg -i cloudflared.deb
   ```
2. Authenticate and route traffic to `http://localhost:80`:
   ```bash
   cloudflared tunnel login
   cloudflared tunnel create meow-tunnel
   cloudflared tunnel route dns meow-tunnel analytics.yourdomain.com
   cloudflared tunnel run meow-tunnel --url http://localhost:80
   ```
Cloudflare manages the SSL certificate and protects against DDoS automatically.

---

## Initial Setup & First Tracking Project

### 1. Log In to Dashboard
Open your browser and navigate to:
```text
https://analytics.yourdomain.com
```
When prompted for the Admin Secret, enter the `ADMIN_SECRET` from your `.env`.

---

### 2. Create Your First Project via API or UI
You can create a project from the dashboard UI or via `curl`:

```bash
curl -X POST http://localhost:3001/api/v1/projects \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Website",
    "privacyMode": "balanced",
    "visitorRetentionHours": 24,
    "eventRetentionDays": 90
  }'
```

Response:
```json
{
  "id": "proj_01j7abc...",
  "site_id": "site_8f19da...",
  "name": "Production Website",
  "privacy_mode": "balanced",
  "status": "active"
}
```

Copy the `site_id` (e.g. `site_8f19da...`).

---

### 3. Embed the Tracking Code
Add this lightweight, non-blocking script to the `<head>` of your website:

```html
<!-- Meow Analytics Tracker (Runs 24/7 on your VM) -->
<script
  defer
  src="https://analytics.yourdomain.com/meow.js"
  data-site-id="site_8f19da..."
  data-auto-track="true">
</script>
```

Open your website in a browser. Events will be instantly delivered to your VM and appear in your dashboard live!

---

## 24/7 Operations & Maintenance

### Automatic Restart on System Reboot
All containers are configured with `restart: unless-stopped`. Ensure Docker daemon starts on boot:
```bash
sudo systemctl enable docker
sudo systemctl enable containerd
```
Even if your VM reboots due to kernel updates or provider maintenance, Meow Analytics starts right back up automatically.

### View Real-Time Logs
```bash
# View all logs
docker compose logs -f

# View API logs only
docker compose logs -f api

# View database logs
docker compose logs -f postgres
```

### Updating to the Latest Version
```bash
cd meow-analytics
git pull
docker compose up -d --build
```
Database migrations execute automatically on container startup without data loss.

### Backing Up Your Database
To create an instant SQL backup of your persistent analytics data:
```bash
docker exec -t meow_postgres pg_dumpall -c -U meow > meow_backup_$(date +%F).sql
```

To restore from a backup:
```bash
cat meow_backup_2026-10-10.sql | docker exec -i meow_postgres psql -U meow -d meow_analytics
```

---

## Troubleshooting

| Issue | Cause | Fix |
| :--- | :--- | :--- |
| **`connection refused` on port 80/443** | Firewall blocking incoming traffic | Run `sudo ufw allow 80` and `sudo ufw allow 443`. Check cloud provider security groups. |
| **Tracker blocked by browser** | Serving tracker over HTTP on an HTTPS site | Set up SSL via Caddy (Option A) or Certbot (Option B). |
| **Container restarting continuously** | Invalid configuration or secrets too short | Check logs: `docker compose logs api`. Ensure `MEOW_SECRET` is >= 32 chars and `ADMIN_SECRET` is >= 16 chars. |
| **Database connection error** | PostgreSQL container still initializing | Fastify retries connections; give PostgreSQL 5–10s to report healthy. |
