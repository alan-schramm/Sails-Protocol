# Docker integration test script

# This script brings up the full compose stack, waits for the service health endpoint, runs a simple curl check, then tears down.
# It is used by the CI workflow and can be run locally for debugging.

set -e

# Start services
docker compose up -d --build

echo "Waiting for the server to become healthy..."
# Poll the health endpoint (adjust port if needed). /health actually
# returns {"status":"ok",...} (lowercase) -- the old case-sensitive
# grep -q "OK" never matched, so this loop ran forever. Found running
# this for real (2026-08-09): the CI step at .github/workflows/ci.yml
# that shells out to this exact script has no job-level timeout, so it
# was silently hanging every run until GitHub's own default 6h ceiling.
ATTEMPTS=0
until curl -s http://localhost:3000/health | grep -q '"status":"ok"'; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge 30 ]; then
    echo "Server did not become healthy after 60s -- failing instead of hanging."
    docker compose logs app
    docker compose down
    exit 1
  fi
  sleep 2
  echo "still waiting..."
done

echo "Server is healthy. Running simple health check..."
curl -s http://localhost:3000/health

echo "Tearing down stack..."
docker compose down
