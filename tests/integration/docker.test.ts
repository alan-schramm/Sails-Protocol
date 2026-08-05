// tests/integration/docker.test.ts

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Docker integration test', () => {
  it('should start the stack, pass health check, and shut down cleanly', async () => {
    // Docker startup can take a while; give the test up to 2 minutes.
    jest.setTimeout(120_000);

    const { stdout, stderr } = await execAsync('bash scripts/docker-test.sh', {
      cwd: process.cwd(),
    });

    // Log output for debugging in CI logs.
    console.log('Docker test stdout:', stdout);
    console.error('Docker test stderr:', stderr);

    // The script exits with status 0 on success; any non‑zero would throw.
    expect(stdout).toContain('OK');
  });
});
