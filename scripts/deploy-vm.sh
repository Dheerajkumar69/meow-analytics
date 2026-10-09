#!/usr/bin/env bash
# ==============================================================================
# Meow Analytics — Automated 24/7 VM Deployment Script
# ==============================================================================
set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "  __  __                  _                 _       _   _           "
echo " |  \/  | ___  _____      _/ \   _ __   __ _| |_   _| |_(_) ___ ___  "
echo " | |\/| |/ _ \/ _ \ \ /\ / / _ \ | '_ \ / _\` | | | | | __| |/ __/ __| "
echo " | |  | |  __/ (_) \ V  V / ___ \| | | | (_| | | |_| | |_| | (__\__ \ "
echo " |_|  |_|\___|\___/ \_/\_/_/   \_\_| |_|\__,_|_|\__, |\__|_|\___|___/ "
echo "                                                |___/                  "
echo -e "${NC}"
echo -e "${GREEN}🐾 Welcome to the Meow Analytics 24/7 VM Deployment Wizard!${NC}\n"

# 1. Check prerequisites
if ! command -v docker &> /dev/null; then
  echo -e "${YELLOW}Docker is not installed on this system.${NC}"
  read -p "Would you like to install Docker automatically now? (y/N): " install_docker
  if [[ "$install_docker" =~ ^[Yy]$ ]]; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker "$USER" 2>/dev/null || true
    rm -f get-docker.sh
    echo -e "${GREEN}Docker installed successfully.${NC}"
  else
    echo -e "${RED}Docker is required to run the automated container stack. Please install Docker and retry.${NC}"
    exit 1
  fi
fi

if ! docker compose version &> /dev/null && ! docker-compose --version &> /dev/null; then
  echo -e "${RED}Docker Compose plugin is required. Please install 'docker-compose-plugin'.${NC}"
  exit 1
fi

# Detect compose command
if docker compose version &> /dev/null; then
  COMPOSE_CMD="docker compose"
else
  COMPOSE_CMD="docker-compose"
fi

# 2. Configure Environment (.env)
ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
  echo -e "${CYAN}Creating production configuration (.env)...${NC}"
  
  # Generate cryptographically secure secrets
  MEOW_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 32)
  ADMIN_SECRET=$(openssl rand -hex 24 2>/dev/null || head -c 24 /dev/urandom | xxd -p -c 24)
  PG_PASS=$(openssl rand -hex 16 2>/dev/null || head -c 16 /dev/urandom | xxd -p -c 16)

  echo -e "Generated secure secrets:"
  echo -e "  • MEOW_SECRET:  ${GREEN}${MEOW_SECRET:0:8}...${NC}"
  echo -e "  • ADMIN_SECRET: ${GREEN}${ADMIN_SECRET:0:8}...${NC}"
  
  read -p "Do you want automatic HTTPS via Caddy (requires a domain pointed to this VM)? (y/N): " use_caddy
  
  DOMAIN="localhost"
  CADDY_EMAIL=""
  USE_SSL="false"
  
  if [[ "$use_caddy" =~ ^[Yy]$ ]]; then
    USE_SSL="true"
    read -p "Enter your public domain (e.g. analytics.yourdomain.com): " DOMAIN
    read -p "Enter your email for Let's Encrypt certificates (e.g. you@example.com): " CADDY_EMAIL
  fi

  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
HOST=0.0.0.0
PORT=3001
PORT_HTTP=80

DOMAIN=${DOMAIN}
CADDY_EMAIL=${CADDY_EMAIL}

POSTGRES_USER=meow
POSTGRES_PASSWORD=${PG_PASS}
POSTGRES_DB=meow_analytics

DATABASE_URL=postgres://meow:${PG_PASS}@postgres:5432/meow_analytics

MEOW_SECRET=${MEOW_SECRET}
ADMIN_SECRET=${ADMIN_SECRET}
CORS_ORIGINS=*

LOG_LEVEL=info
ASYNC_INGESTION=true
DATABASE_POOL_MAX=25
RATE_LIMIT_ENABLED=true
ENABLE_BACKGROUND_WORKERS=true
EOF

  echo -e "${GREEN}✓ Production .env configuration saved!${NC}\n"
else
  echo -e "${GREEN}✓ Existing .env file found. Using existing settings.${NC}"
  ADMIN_SECRET=$(grep '^ADMIN_SECRET=' "$ENV_FILE" | cut -d '=' -f2-)
  DOMAIN=$(grep '^DOMAIN=' "$ENV_FILE" | cut -d '=' -f2-)
  [ -z "$DOMAIN" ] && DOMAIN="localhost"
fi

# 3. Launch Containers
echo -e "${CYAN}Building and launching Meow Analytics containers...${NC}"

if [ -f "docker-compose.caddy.yml" ] && [ "$DOMAIN" != "localhost" ]; then
  echo -e "${GREEN}Enabling automatic Let's Encrypt SSL with Caddy for ${DOMAIN}...${NC}"
  $COMPOSE_CMD -f docker-compose.yml -f docker-compose.caddy.yml up -d --build
else
  $COMPOSE_CMD up -d --build
fi

# 4. Wait for Health Check
echo -e "\n${CYAN}Waiting for Meow Analytics services to be ready...${NC}"
MAX_RETRIES=30
RETRY_COUNT=0

until curl -s http://127.0.0.1:3001/api/health | grep -q "ok" || [ $RETRY_COUNT -eq $MAX_RETRIES ]; do
  sleep 2
  RETRY_COUNT=$((RETRY_COUNT+1))
  echo -n "."
done

echo ""

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo -e "${YELLOW}⚠️ API took longer than expected to report healthy. Check logs using: ${COMPOSE_CMD} logs -f api${NC}"
else
  echo -e "${GREEN}✅ Meow Analytics is UP AND RUNNING 24/7!${NC}"
fi

# 5. Summary and Next Steps
echo -e "\n=================================================================="
echo -e "${GREEN}🎉 DEPLOYMENT COMPLETE!${NC}"
echo -e "=================================================================="
if [ "$DOMAIN" != "localhost" ]; then
  echo -e "🌐 Dashboard URL:    ${CYAN}https://${DOMAIN}${NC}"
  echo -e "📡 Ingestion Script: ${CYAN}https://${DOMAIN}/meow.js${NC}"
  echo -e "🩺 Health Endpoint:  ${CYAN}https://${DOMAIN}/api/health${NC}"
else
  echo -e "🌐 Dashboard URL:    ${CYAN}http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_VM_IP'):80${NC}"
  echo -e "📡 Ingestion Script: ${CYAN}http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_VM_IP'):80/meow.js${NC}"
  echo -e "🩺 Health Endpoint:  ${CYAN}http://localhost:3001/api/health${NC}"
fi
echo -e "🔑 ADMIN SECRET:     ${YELLOW}${ADMIN_SECRET}${NC}"
echo -e "=================================================================="
echo -e "\n${CYAN}Quick Start: Create your first tracking project:${NC}"
echo -e "curl -X POST http://localhost:3001/api/v1/projects \\"
echo -e "  -H \"Authorization: Bearer ${ADMIN_SECRET}\" \\"
echo -e "  -H \"Content-Type: application/json\" \\"
echo -e "  -d '{\"name\":\"My Website\"}'\n"
echo -e "Manage your 24/7 stack:"
echo -e "  • View logs:    ${COMPOSE_CMD} logs -f"
echo -e "  • Stop stack:   ${COMPOSE_CMD} down"
echo -e "  • Restart:      ${COMPOSE_CMD} restart"
echo -e "==================================================================\n"
