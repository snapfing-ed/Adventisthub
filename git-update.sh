#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

MSG="${1:-feat: Module 4 governance + microservice gateway & feature-based frontend refactor}"

# Ensure secrets & local backups are ignored
touch .gitignore
for pattern in ".env" "packages/backend/.env" "packages/frontend/.env.local" "*.bak" ".next/" "dist/"; do
  grep -qxF "$pattern" .gitignore 2>/dev/null || echo "$pattern" >> .gitignore
done

git add -A

if git diff --cached --quiet; then
  echo "No staged changes to commit."
else
  git commit -m "$MSG"
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if git remote get-url origin >/dev/null 2>&1; then
  echo "Pushing branch '$BRANCH' to origin..."
  git push -u origin "$BRANCH"
else
  echo "Warning: No 'origin' remote configured. Committed locally on '$BRANCH'."
fi
