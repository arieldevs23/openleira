import { randomInt } from 'node:crypto';
import { createRequire } from 'node:module';

import { getConnection, userDb } from '@/modules/database/index.js';

import { authenticateToken, generateToken } from './auth.middleware.js';
import { createAuthRouter } from './auth.routes.js';
import { createAuthService } from './auth.service.js';

type BcryptAdapter = {
  hash(password: string, saltRounds: number): Promise<string>;
  compare(password: string, passwordHash: string): Promise<boolean>;
};

// bcrypt does not ship TypeScript declarations in this project, so the
// composition root narrows its CommonJS runtime surface before injecting it.
const require = createRequire(import.meta.url);
const bcrypt = require('bcrypt') as BcryptAdapter;
const databaseConnection = getConnection();

const RANDOM_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const RANDOM_PASSWORD_LENGTH = 16;

// Unambiguous alphanumerics so a password printed in a terminal is easy to retype.
function generateRandomPassword(): string {
  let password = '';
  for (let index = 0; index < RANDOM_PASSWORD_LENGTH; index += 1) {
    password += RANDOM_PASSWORD_ALPHABET[randomInt(RANDOM_PASSWORD_ALPHABET.length)];
  }
  return password;
}

const authService = createAuthService({
  users: {
    hasUsers: () => userDb.hasUsers(),
    createUser: (username, passwordHash) => userDb.createUser(username, passwordHash),
    getUserByUsername: (username) => userDb.getUserByUsername(username),
    updateLastLogin: (userId) => userDb.updateLastLogin(userId),
    updatePasswordHash: (userId, passwordHash) => userDb.updatePasswordHash(userId, passwordHash),
  },
  transaction: {
    begin: () => databaseConnection.prepare('BEGIN').run(),
    commit: () => databaseConnection.prepare('COMMIT').run(),
    rollback: () => databaseConnection.prepare('ROLLBACK').run(),
  },
  hashPassword: (password) => bcrypt.hash(password, 12),
  comparePassword: (password, passwordHash) => bcrypt.compare(password, passwordHash),
  generateToken,
  generateRandomPassword,
});

/** Auth router assembled for the server entrypoint. */
export const authRoutes = createAuthRouter(authService, authenticateToken);

/**
 * Used by the CLI module's `reset-password` command to replace a forgotten
 * password straight in auth.db. Resolves with the password that was set.
 */
export function resetUserPassword(username: string, newPassword?: string) {
  return authService.resetPassword(username, newPassword);
}
