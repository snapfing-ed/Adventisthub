#!/usr/bin/env bash
set -e

sudo service postgresql start >/dev/null 2>&1 || true

export NODE_PATH="$(pwd)/packages/backend/node_modules"

trap 'kill 0' EXIT

node packages/services/identity-service/src/index.js &
node packages/services/directory-service/src/index.js &
node packages/services/clerk-service/src/index.js &
node packages/services/governance-service/src/index.js &
sleep 1
node packages/gateway/src/index.js &

echo "All AdventistHub microservices running behind API Gateway on http://localhost:5000"
echo "Test aggregated health: curl http://localhost:5000/api/health"
wait


# Terminal 1 (Microservices + Gateway):
#cd ~/projects/adventisthub/packages/frontend
# npm run dev