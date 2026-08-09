// tests/integration/docker.test.ts

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Docker integration test', () => {
  jest.setTimeout(120_000);

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
