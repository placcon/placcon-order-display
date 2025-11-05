#!/bin/bash

# Placcon Order Display Version Check Script
# This script checks if the package.json version matches the git tag

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Placcon Order Display Version Check${NC}"
echo "=================================="

# Get package.json version
PACKAGE_VERSION=$(node -p "require('./package.json').version")
echo -e "${YELLOW}Package.json version: $PACKAGE_VERSION${NC}"

# Get current git tag
CURRENT_TAG=$(git describe --tags --exact-match 2>/dev/null || echo "no-tag")
echo -e "${YELLOW}Current git tag: $CURRENT_TAG${NC}"

# Get latest tag
LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "no-tags")
echo -e "${YELLOW}Latest git tag: $LATEST_TAG${NC}"

# Check if versions match
if [ "$CURRENT_TAG" != "no-tag" ]; then
    # Remove 'v' prefix from tag
    TAG_VERSION=${CURRENT_TAG#v}
    
    if [ "$PACKAGE_VERSION" = "$TAG_VERSION" ]; then
        echo -e "${GREEN}✅ Versions match!${NC}"
        echo "Package.json: $PACKAGE_VERSION"
        echo "Git tag: $CURRENT_TAG"
        exit 0
    else
        echo -e "${RED}❌ Version mismatch!${NC}"
        echo "Package.json: $PACKAGE_VERSION"
        echo "Git tag: $CURRENT_TAG"
        echo ""
        echo "To fix this:"
        echo "1. Update package.json: npm version $TAG_VERSION --no-git-tag-version"
        echo "2. Commit changes: git add package.json && git commit -m 'Update version'"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  No exact tag found${NC}"
    echo "Current branch is not on a tag."
    echo ""
    echo "To create a release:"
    if [[ "$PACKAGE_VERSION" == *"-order" ]]; then
        echo "1. Create an order display tag: git tag v$PACKAGE_VERSION"
        echo "2. Push the tag: git push origin v$PACKAGE_VERSION"
    else
        echo "1. Create a regular tag: git tag v$PACKAGE_VERSION"
        echo "2. Push the tag: git push origin v$PACKAGE_VERSION"
    fi
    exit 0
fi 