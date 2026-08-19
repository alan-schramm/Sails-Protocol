// tests/integration/docker.test.ts

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Docker integration test', () => {
  // 120s (the original budget) only covers a cached `docker compose up
  // -d --build` -- a health-check poll plus a few seconds of layer reuse.
  // It does not cover a build from scratch: found for real, 2026-08-15,
  // after a large package-lock.json refresh invalidated Docker's
  // `npm install` layer cache for every workspace package (root,
  // sails-sdk, sdk-react, contracts) -- rebuilding + exporting the
  // resulting ~14.7GB `builder`-stage image (see docker-compose.yml's own
  // comment on why `app`/`migrate` use `builder`, not the slim `runtime`
  // stage) alone ran well past 120s before the health-check loop even
  // started. Not a hang and not an app bug -- `docker-test.sh`'s own
  // 60s-bounded health poll (30 attempts x 2s) already fails fast with a
  // clear message if the server itself never comes up; this larger
  // ceiling only accounts for the build step ahead of it.
  //
  // 600s was still not enough -- measured for real, 2026-08-19 (Missão
  // 10, Fase 6.10/6.11): a from-scratch build took 1745s (npm ci alone:
  // 843.5s; image layer export/unpack alone: 1460.5s), and a SECOND
  // consecutive build with nothing changed took 2161s -- LONGER, not
  // shorter, meaning this is not simply "cold cache, warms up on rerun":
  // BuildKit's cache was not effectively reused across separate `docker
  // compose build` invocations on this machine. 3_000_000 (50 min) gives
  // real margin over the worst measured run (2161s) on this specific
  // Docker Desktop/Windows/WSL2 environment. This is a timeout
  // accommodation, not a fix for the underlying build performance --
  // that root cause (cache reuse, image export cost) is untouched here.
  jest.setTimeout(3_000_000);

  let dockerAvailable = false;

  beforeAll(async () => {
    try {
      await execAsync('bash -c "docker info"');
      dockerAvailable = true;
    } catch {
      dockerAvailable = false;
    }
  });

  it('should start the stack, pass health check, and shut down cleanly', async () => {
    if (!dockerAvailable) {
      console.warn('Skipping Docker integration test because Docker is not available in this environment.');
      return;
    }

    // Docker startup can take a while; give the test up to 2 minutes.
    const { stdout, stderr } = await execAsync('bash scripts/docker-test.sh', {
      cwd: process.cwd(),
    });

    // Log output for debugging in CI logs.
    console.log('Docker test stdout:', stdout);
    console.error('Docker test stderr:', stderr);

    // The script exits with status 0 on success; any non‑zero would throw.
    // Real /health response is {"status":"ok",...} (lowercase) -- the old
    // toContain('OK') never matched any of the script's actual stdout,
    // so this assertion would have failed even once docker-test.sh's own
    // matching bug (case-sensitive grep -q "OK") was fixed. Found running
    // this for real, 2026-08-09.
    expect(stdout).toContain('"status":"ok"');
  });
});
