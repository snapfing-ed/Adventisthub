#!/usr/bin/env bash
set -e

sudo service postgresql start >/dev/null 2>&1 || true
export NODE_PATH="$(pwd)/packages/backend/node_modules"

trap 'kill 0' EXIT

node packages/services/identity-service/src/index.js &
node packages/services/directory-service/src/index.js &
node packages/services/clerk-service/src/index.js &
node packages/services/governance-service/src/index.js &
node packages/services/automation-service/src/index.js &
node packages/services/treasury-service/src/index.js &
node packages/services/pcm-service/src/index.js &
node packages/services/portal-service/src/index.js &
sleep 1
node packages/gateway/src/index.js &

echo "All AdventistHub microservices (5001-5008) running behind API Gateway on http://localhost:5000"
wait
