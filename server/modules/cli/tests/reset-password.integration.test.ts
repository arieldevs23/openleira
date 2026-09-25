import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeConnection, getConnection, initializeDatabase } from '@/modules/database/index.js';

import { createCliService } from '../cli.service.js';

const require = createRequire(import.meta.url);
const bcrypt = require('bcrypt') as {
  hash(password: string, saltRounds: number): Promise<string>;
  compare(password: string, passwordHash: string): Promise<boolean>;
};

function readPasswordHash(username: string): string {
  const row = getConnection()
    .prepare('SELECT password_hash FROM users WHERE username = ?')
    .get(username) as { password_hash: string };
  return row.password_hash;
}

test('reset-password rewrites the stored bcrypt hash in auth.db', async () => {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'reset-password-cli-'));
  const databasePath = path.join(tempDirectory, 'auth.db');

  closeConnection();
  process.env.DATABASE_PATH = databasePath;
  await writeFile(databasePath, '');
  await initializeDatabase();
  const originalHash = await bcrypt.hash('forgotten-password', 4);
  getConnection()
    .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
    .run('alice', originalHash);

  // Imported after DATABASE_PATH points at the temp file: the auth module
  // opens its connection at load time.
  const { resetUserPassword } = await import('@/modules/auth/index.js');
  const logMessages: string[] = [];
  const cli = createCliService({
    applicationRoot: tempDirectory,
    defaultDatabasePath: databasePath,
    homeDirectory: tempDirectory,
    packageMetadata: { version: '0.0.0' },
    environment: { DATABASE_PATH: databasePath },
    fileSystem: {
      pathExists: () => true,
      getFileStats: () => ({ size: 0, modifiedAt: new Date(0) }),
    },
    output: { log: (message = '') => logMessages.push(message), error: (message = '') => logMessages.push(message) },
    sandboxService: { execute: async () => 0 },
    getLatestPackageVersion: async () => '0.0.0',
    updateGlobalPackage: () => undefined,
    startServer: async () => undefined,
    startBrowserUseMcp: async () => undefined,
    resetPassword: resetUserPassword,
  });

  try {
    assert.equal(await cli.run(['reset-password', 'alice', '--password', 'brand-new-pass']), 0);
    const explicitHash = readPasswordHash('alice');
    assert.notEqual(explicitHash, originalHash);
    assert.equal(await bcrypt.compare('brand-new-pass', explicitHash), true);

    assert.equal(await cli.run(['reset-password', 'alice']), 0);
    // eslint-disable-next-line no-control-regex -- strip terminal colour codes
    const plainOutput = logMessages.join('\n').replace(/\x1b\[[0-9;]*m/g, '');
    const generatedPassword = /New password: ([A-Za-z0-9]{16})\b/.exec(plainOutput)?.[1];
    assert.ok(generatedPassword, 'generated password is printed once');
    const generatedHash = readPasswordHash('alice');
    assert.notEqual(generatedHash, explicitHash);
    assert.equal(await bcrypt.compare(generatedPassword, generatedHash), true);

    assert.equal(await cli.run(['reset-password', 'nobody', '--password', 'brand-new-pass']), 1);
  } finally {
    closeConnection();
    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    await rm(tempDirectory, { recursive: true, force: true });
  }
});
