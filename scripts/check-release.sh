#!/bin/bash

# Placcon Launcher Release Check Script
# This script checks if a release already exists for a given tag

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Placcon Launcher Release Check${NC}"
echo "=================================="

# Check if tag is provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: Please provide a tag name${NC}"
    echo "Usage: $0 <tag>"
    echo "Example: $0 v1.8.0"
    exit 1
fi

TAG=$1
echo -e "${YELLOW}Checking release for tag: $TAG${NC}"

# Check if GitHub CLI is available
if ! command -v gh &> /dev/null; then
    echo -e "${RED}Error: GitHub CLI (gh) is not installed${NC}"
    echo "Please install GitHub CLI first:"
    echo "https://cli.github.com/"
    exit 1
fi

# Check if release exists
if gh release view "$TAG" >/dev/null 2>&1; then
    echo -e "${RED}❌ Release for tag $TAG already exists!${NC}"
    echo ""
    echo "Existing release details:"
    gh release view "$TAG" --json name,url,createdAt,assets
    
    echo ""
    echo "To fix this:"
    echo "1. Use a different version: git tag v1.8.1"
    echo "2. Or delete the existing release: gh release delete $TAG"
    echo "3. Then create a new tag: git tag $TAG"
    exit 1
else
    echo -e "${GREEN}✅ No existing release found for tag $TAG${NC}"
    echo ""
    echo "You can safely create a release for this tag."
    echo ""
    echo "To create a release:"
    echo "1. git tag $TAG"
    echo "2. git push origin $TAG"
    echo "3. Or use: npm run release $TAG"
    exit 0
fi 