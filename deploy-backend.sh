#!/bin/bash

# Backend Auto Deploy Script
set -e

APP_DIR="/var/www/html/pallavin-be"
BRANCH="main"
PM2_APP_NAME="pallavin-be"
NODE_ENV="production"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🚀 Starting backend deployment...${NC}"

cd "$APP_DIR"

# Always trust GitHub (server must match origin)
echo -e "${YELLOW}🔄 Syncing with GitHub...${NC}"
git fetch origin
git reset --hard origin/$BRANCH
git clean -fd

# Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install --production

# Build if available
if grep -q "\"build\"" package.json; then
  echo -e "${YELLOW}🔨 Building application...${NC}"
  npm run build
fi

# Restart PM2
echo -e "${YELLOW}🔄 Restarting backend...${NC}"
if pm2 list | grep -q "$PM2_APP_NAME"; then
  pm2 restart "$PM2_APP_NAME"
else
  pm2 start src/index.js --name "$PM2_APP_NAME"
fi

pm2 save

echo -e "${GREEN}✅ Backend deployed successfully at $(date)${NC}"
pm2 list
