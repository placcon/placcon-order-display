#!/bin/bash

# Placcon Order Display Build Script
# This script builds the order display version

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Placcon Order Display Build Script${NC}"
echo "=================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: package.json not found. Please run this script from the project root.${NC}"
    exit 1
fi

# Backup original files
echo -e "${YELLOW}Backing up original files...${NC}"
cp package.json package.json.backup
cp main.js main.js.backup 2>/dev/null || true

# Switch to order display files
echo -e "${YELLOW}Switching to order display configuration...${NC}"
cp package.json package.json
cp main.js main.js

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
fi

# Build for all platforms
echo -e "${GREEN}Building order display for all platforms...${NC}"
npm run build:all

# Restore original files
echo -e "${YELLOW}Restoring original files...${NC}"
mv package.json.backup package.json
mv main.js.backup main.js 2>/dev/null || true

echo -e "${GREEN}Order display build completed successfully!${NC}"
echo "Build files are in the dist/ directory"
echo ""
echo "To create a release:"
echo "1. Create a tag: git tag v1.10.0-order"
echo "2. Push the tag: git push origin v1.10.0-order"
echo "3. The GitLab CI/CD will automatically build and release" 