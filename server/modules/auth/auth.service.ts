import { AppError } from '@/shared/utils.js';

type AuthUser = {
  id: number | bigint;
  username: string;
};

type AuthLoginUser = AuthUser & { password_hash: string };

type AuthDependencies = {
  users: {
    hasUsers(): boolean;
    createUser(username: string, passwordHash: string): AuthUser;
    getUserByUsername(username: string): AuthLoginUser | undefined;
    updateLastLogin(userId: number): void;
    updatePasswordHash(userId: number, passwordHash: string): void;
  };
  transaction: {
    begin(): void;
    commit(): void;
    rollback(): void;
  };
  hashPassword(password: string): Promise<string>;
  comparePassword(password: string, passwordHash: string): Promise<boolean>;
  generateToken(user: AuthUser): string;
  generateRandomPassword(): string;
};

// Usernames are shown in paths, logs and the UI, so keep them to a safe charset.
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,32}$/;
const MIN_PASSWORD_LENGTH = 8;

function assertValidUsername(username: string): void {
  if (!USERNAME_PATTERN.test(username)) {
    throw new AppError(
      'Username must be 3-32 characters: letters, numbers or underscore',
      { code: 'AUTH_USERNAME_INVALID', statusCode: 400 },
    );
  }
}

function assertValidNewPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, {
      code: 'AUTH_PASSWORD_TOO_SHORT',
      statusCode: 400,
    });
  }
}

function numericUserId(userId: number | bigint): number {
  return Number(userId);
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'SQLITE_CONSTRAINT_UNIQUE';
}

/**
 * Creates the Auth application service around explicit persistence, crypto,
 * transaction, and token dependencies.
 */
export function createAuthService(dependencies: AuthDependencies) {
  return {
    getStatus() {
      return {
        needsSetup: !dependencies.users.hasUsers(),
        isAuthenticated: false,
      };
    },

    async register(usernameInput: unknown, passwordInput: unknown) {
      const username = typeof usernameInput === 'string' ? usernameInput : '';
      const password = typeof passwordInput === 'string' ? passwordInput : '';

      if (!username || !password) {
        throw new AppError('Username and password are required', {
          code: 'AUTH_CREDENTIALS_REQUIRED',
          statusCode: 400,
        });
      }
      assertValidUsername(username);
      assertValidNewPassword(password);

      dependencies.transaction.begin();
      try {
        if (dependencies.users.hasUsers()) {
          throw new AppError('User already exists. This is a single-user system.', {
            code: 'AUTH_USER_ALREADY_CONFIGURED',
            statusCode: 403,
          });
        }

        const passwordHash = await dependencies.hashPassword(password);
        const user = dependencies.users.createUser(username, passwordHash);
        const token = dependencies.generateToken(user);
        dependencies.transaction.commit();
        dependencies.users.updateLastLogin(numericUserId(user.id));

        return {
          success: true,
          user: { id: user.id, username: user.username },
          token,
        };
      } catch (error) {
        dependencies.transaction.rollback();
        if (isUniqueConstraintError(error)) {
          throw new AppError('Username already exists', {
            code: 'AUTH_USERNAME_CONFLICT',
            statusCode: 409,
          });
        }
        throw error;
      }
    },

    async login(usernameInput: unknown, passwordInput: unknown) {
      const username = typeof usernameInput === 'string' ? usernameInput : '';
      const password = typeof passwordInput === 'string' ? passwordInput : '';
      if (!username || !password) {
        throw new AppError('Username and password are required', {
          code: 'AUTH_CREDENTIALS_REQUIRED',
          statusCode: 400,
        });
      }

      const user = dependencies.users.getUserByUsername(username);
      const validPassword = user
        ? await dependencies.comparePassword(password, user.password_hash)
        : false;
      if (!user || !validPassword) {
        throw new AppError('Invalid username or password', {
          code: 'AUTH_INVALID_CREDENTIALS',
          statusCode: 401,
        });
      }

      dependencies.users.updateLastLogin(numericUserId(user.id));
      return {
        success: true,
        user: { id: user.id, username: user.username },
        token: dependencies.generateToken(user),
      };
    },

    /**
     * Replaces the signed-in user's password after re-checking the current one.
     * Issued tokens stay valid: they carry no password-derived claim.
     */
    async changePassword(user: unknown, currentPasswordInput: unknown, newPasswordInput: unknown) {
      const username = typeof user === 'object' && user !== null && 'username' in user
        && typeof user.username === 'string' ? user.username : '';
      const currentPassword = typeof currentPasswordInput === 'string' ? currentPasswordInput : '';
      const newPassword = typeof newPasswordInput === 'string' ? newPasswordInput : '';
      if (!currentPassword || !newPassword) {
        throw new AppError('Current and new password are required', {
          code: 'AUTH_CREDENTIALS_REQUIRED',
          statusCode: 400,
        });
      }

      const storedUser = username ? dependencies.users.getUserByUsername(username) : undefined;
      if (!storedUser) {
        throw new AppError('Authenticated user is required', {
          code: 'AUTH_USER_REQUIRED',
          statusCode: 401,
        });
      }
      if (!await dependencies.comparePassword(currentPassword, storedUser.password_hash)) {
        throw new AppError('Current password is incorrect', {
          code: 'AUTH_CURRENT_PASSWORD_INVALID',
          statusCode: 400,
        });
      }
      assertValidNewPassword(newPassword);

      const passwordHash = await dependencies.hashPassword(newPassword);
      dependencies.users.updatePasswordHash(numericUserId(storedUser.id), passwordHash);
      return { success: true };
    },

    /**
     * Sets a new password for `username` without knowing the old one. Only the
     * CLI calls this, since shell access to the data directory already implies
     * ownership. Generates a random password when none is supplied.
     */
    async resetPassword(usernameInput: string, newPasswordInput?: string) {
      const storedUser = dependencies.users.getUserByUsername(usernameInput);
      if (!storedUser) {
        throw new AppError(`User "${usernameInput}" not found`, {
          code: 'AUTH_USER_NOT_FOUND',
          statusCode: 404,
        });
      }

      const isGenerated = newPasswordInput === undefined;
      const newPassword = newPasswordInput ?? dependencies.generateRandomPassword();
      assertValidNewPassword(newPassword);

      const passwordHash = await dependencies.hashPassword(newPassword);
      dependencies.users.updatePasswordHash(numericUserId(storedUser.id), passwordHash);
      return { username: storedUser.username, password: newPassword, isGenerated };
    },

    getCurrentUser(user: unknown) {
      return { user };
    },

    refreshSession(user: unknown) {
      if (
        typeof user !== 'object'
        || user === null
        || !('id' in user)
        || !('username' in user)
        || (typeof user.id !== 'number' && typeof user.id !== 'bigint')
        || typeof user.username !== 'string'
      ) {
        throw new AppError('Authenticated user is required', {
          code: 'AUTH_USER_REQUIRED',
          statusCode: 401,
        });
      }

      return { token: dependencies.generateToken(user as AuthUser) };
    },

    logout() {
      return { success: true, message: 'Logged out successfully' };
    },
  };
}
