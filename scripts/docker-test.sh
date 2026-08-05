# Docker integration test script

# This script brings up the full compose stack, waits for the service health endpoint, runs a simple curl check, then tears down.
# It is used by the CI workflow and can be run locally for debugging.

set -e

# Start services
docker compose up -d --build

echo "Waiting for the server to become healthy..."
# Poll the health endpoint (adjust port if needed)
until curl -s http://localhost:3000/health | grep -q "OK"; do
  sleep 2
  echo "still waiting..."
done

echo "Server is healthy. Running simple health check..."
curl -s http://localhost:3000/health

echo "Tearing down stack..."
docker compose down
