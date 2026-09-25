import assert from 'node:assert/strict';
import test from 'node:test';

import { AppError } from '@/shared/utils.js';

import { createAuthService } from '../auth.service.js';

type AuthDependencies = Parameters<typeof createAuthService>[0];

function createDependencies(overrides: Partial<AuthDependencies> = {}): AuthDependencies {
  return {
    users: {
      hasUsers: () => false,
      createUser: (username, passwordHash) => ({ id: 1, username, password_hash: passwordHash }),
      getUserByUsername: () => undefined,
      updateLastLogin: () => undefined,
      updatePasswordHash: () => undefined,
    },
    transaction: {
      begin: () => undefined,
      commit: () => undefined,
      rollback: () => undefined,
    },
    hashPassword: async () => 'hashed-password',
    comparePassword: async () => false,
    generateToken: () => 'signed-token',
    generateRandomPassword: () => 'Rand0mPassw0rd16',
    ...overrides,
  };
}

test('register hashes credentials and commits through injected dependencies', async () => {
  const operations: string[] = [];
  const service = createAuthService(createDependencies({
    transaction: {
      begin: () => operations.push('begin'),
      commit: () => operations.push('commit'),
      rollback: () => operations.push('rollback'),
    },
    hashPassword: async (password) => {
      operations.push(`hash:${password}`);
      return 'hash';
    },
    users: {
      hasUsers: () => false,
      createUser: (username, passwordHash) => {
        operations.push(`create:${username}:${passwordHash}`);
        return { id: 1, username, password_hash: passwordHash };
      },
      getUserByUsername: () => undefined,
      updateLastLogin: (userId) => operations.push(`login:${userId}`),
      updatePasswordHash: () => undefined,
    },
  }));

  const result = await service.register('alice', 'secret12');

  assert.equal(result.token, 'signed-token');
  assert.deepEqual(operations, ['begin', 'hash:secret12', 'create:alice:hash', 'commit', 'login:1']);
});

test('login rejects an invalid password without issuing a token', async () => {
  let tokenIssued = false;
  const service = createAuthService(createDependencies({
    users: {
      hasUsers: () => true,
      createUser: () => { throw new Error('unused'); },
      getUserByUsername: () => ({ id: 1, username: 'alice', password_hash: 'hash' }),
      updateLastLogin: () => undefined,
      updatePasswordHash: () => undefined,
    },
    comparePassword: async () => false,
    generateToken: () => {
      tokenIssued = true;
      return 'token';
    },
  }));

  await assert.rejects(
    service.login('alice', 'wrong-password'),
    (error: unknown) => error instanceof AppError && error.code === 'AUTH_INVALID_CREDENTIALS',
  );
  assert.equal(tokenIssued, false);
});

test('refreshSession issues a replacement token for the authenticated user', () => {
  let tokenUser: { id: number | bigint; username: string } | undefined;
  const service = createAuthService(createDependencies({
    generateToken: (user) => {
      tokenUser = user;
      return 'replacement-token';
    },
  }));

  const result = service.refreshSession({ id: 7, username: 'alice' });

  assert.deepEqual(result, { token: 'replacement-token' });
  assert.deepEqual(tokenUser, { id: 7, username: 'alice' });
});

// In-memory user store whose hash changes are observable, standing in for auth.db.
function createPasswordStore(initialHash: string) {
  const store = { passwordHash: initialHash };
  const dependencies = createDependencies({
    users: {
      hasUsers: () => true,
      createUser: () => { throw new Error('unused'); },
      getUserByUsername: (username) => (username === 'alice'
        ? { id: 1, username: 'alice', password_hash: store.passwordHash }
        : undefined),
      updateLastLogin: () => undefined,
      updatePasswordHash: (_userId, passwordHash) => { store.passwordHash = passwordHash; },
    },
    hashPassword: async (password) => `hash:${password}`,
    comparePassword: async (password, passwordHash) => passwordHash === `hash:${password}`,
  });
  return { store, service: createAuthService(dependencies) };
}

const signedInAlice = { id: 1, username: 'alice' };

test('register rejects usernames outside 3-32 alphanumeric/underscore', async () => {
  const service = createAuthService(createDependencies());
  for (const username of ['ab', 'a'.repeat(33), 'bad name', 'dash-name']) {
    await assert.rejects(
      service.register(username, 'longenough'),
      (error: unknown) => error instanceof AppError && error.code === 'AUTH_USERNAME_INVALID',
    );
  }
});

test('register rejects passwords shorter than 8 characters', async () => {
  const service = createAuthService(createDependencies());
  await assert.rejects(
    service.register('alice', 'short12'),
    (error: unknown) => error instanceof AppError && error.code === 'AUTH_PASSWORD_TOO_SHORT',
  );
});

test('changePassword stores a new hash when the current password matches', async () => {
  const { store, service } = createPasswordStore('hash:oldpassword');

  const result = await service.changePassword(signedInAlice, 'oldpassword', 'newpassword');

  assert.deepEqual(result, { success: true });
  assert.equal(store.passwordHash, 'hash:newpassword');
});

test('changePassword rejects a wrong current password and keeps the hash', async () => {
  const { store, service } = createPasswordStore('hash:oldpassword');

  await assert.rejects(
    service.changePassword(signedInAlice, 'wrongpassword', 'newpassword'),
    (error: unknown) => error instanceof AppError && error.code === 'AUTH_CURRENT_PASSWORD_INVALID',
  );
  assert.equal(store.passwordHash, 'hash:oldpassword');
});

test('changePassword rejects a new password shorter than 8 characters', async () => {
  const { store, service } = createPasswordStore('hash:oldpassword');

  await assert.rejects(
    service.changePassword(signedInAlice, 'oldpassword', 'short'),
    (error: unknown) => error instanceof AppError && error.code === 'AUTH_PASSWORD_TOO_SHORT',
  );
  assert.equal(store.passwordHash, 'hash:oldpassword');
});

test('resetPassword replaces the hash with the given password', async () => {
  const { store, service } = createPasswordStore('hash:forgotten');

  const result = await service.resetPassword('alice', 'brandnewpass');

  assert.equal(store.passwordHash, 'hash:brandnewpass');
  assert.deepEqual(result, { username: 'alice', password: 'brandnewpass', isGenerated: false });
});

test('resetPassword generates a password when none is given', async () => {
  const { store, service } = createPasswordStore('hash:forgotten');

  const result = await service.resetPassword('alice');

  assert.equal(result.isGenerated, true);
  assert.equal(result.password, 'Rand0mPassw0rd16');
  assert.equal(store.passwordHash, 'hash:Rand0mPassw0rd16');
});

test('resetPassword fails for an unknown user', async () => {
  const { service } = createPasswordStore('hash:forgotten');

  await assert.rejects(
    service.resetPassword('bob', 'brandnewpass'),
    (error: unknown) => error instanceof AppError && error.code === 'AUTH_USER_NOT_FOUND',
  );
});
