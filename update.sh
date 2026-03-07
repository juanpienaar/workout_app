#!/bin/bash
# ================================================
# Workout App Updater
# ================================================
# Usage:
#   ./update.sh                          → rebuild from CSV and push
#   ./update.sh --assign "Name:Program:YYYY-MM-DD"  → assign a user and push
#   ./update.sh --remove "Name"          → remove a user and push
#
# Examples:
#   ./update.sh
#   ./update.sh --assign "Juan:Hypertrophy A:2026-03-02"
#   ./update.sh --assign "Sarah:Strength B:2026-03-10"
#   ./update.sh --remove "Sarah"
# ================================================

set -e
cd "$(dirname "$0")"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo "========================================="
echo "  Workout App Updater"
echo "========================================="
echo ""

# Handle --remove flag
REMOVE_USER=""
for arg in "$@"; do
    if [ "$prev" = "--remove" ]; then
        REMOVE_USER="$arg"
    fi
    prev="$arg"
done

if [ -n "$REMOVE_USER" ]; then
    if [ -f users.json ]; then
        python3 -c "
import json, sys
with open('users.json','r') as f: users = json.load(f)
name = '$REMOVE_USER'
if name in users:
    del users[name]
    with open('users.json','w') as f: json.dump(users, f, indent=2)
    print(f'Removed {name}')
else:
    print(f'{name} not found. Current users: {list(users.keys())}')
    sys.exit(1)
"
    fi
fi

# Check CSV exists
CSV_FILES=(*.csv)
if [ ${#CSV_FILES[@]} -eq 0 ]; then
    echo -e "${RED}Error: No CSV files found in this directory${NC}"
    exit 1
fi

# If multiple CSVs, combine them. Otherwise use the single one.
if [ ${#CSV_FILES[@]} -eq 1 ]; then
    CSV_FILE="${CSV_FILES[0]}"
    echo -e "📋 Using: ${GREEN}${CSV_FILE}${NC}"
else
    echo -e "📋 Found multiple CSV files: ${GREEN}${CSV_FILES[*]}${NC}"
    CSV_FILE="${CSV_FILES[0]}"
    echo -e "   Using: ${GREEN}${CSV_FILE}${NC}"
fi

# Build assign arguments
ASSIGN_ARGS=""
for arg in "$@"; do
    if [ "$prev" = "--assign" ]; then
        ASSIGN_ARGS="$ASSIGN_ARGS --assign \"$arg\""
    fi
    prev="$arg"
done

# Run build
echo ""
echo "🔨 Building program.json..."
eval python3 build.py "$CSV_FILE" $ASSIGN_ARGS
echo ""

# Show current users
if [ -f users.json ]; then
    echo -e "${YELLOW}Current users:${NC}"
    python3 -c "
import json
with open('users.json') as f: users = json.load(f)
for name, info in users.items():
    print(f'  {name} → {info[\"program\"]} (started {info[\"startDate\"]})')
"
    echo ""
fi

# Git push
echo "🚀 Pushing to GitHub..."
git add program.json users.json
git commit -m "Update workout program $(date +%Y-%m-%d)" 2>/dev/null || echo -e "${YELLOW}No changes to commit${NC}"
git push

echo ""
echo -e "${GREEN}✅ Done! Changes will be live in ~1 minute at:${NC}"
echo -e "   https://numnum.fit/"
echo ""
