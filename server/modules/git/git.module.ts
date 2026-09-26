import * as fs from 'node:fs/promises';

import spawn from 'cross-spawn';

import { githubTokensDb, projectsDb } from '@/modules/database/index.js';

import { createGitRouter } from './git.routes.js';

type GitExternalDependencies = Pick<
  Parameters<typeof createGitRouter>[0],
  'queryClaude' | 'queryCursor'
>;

/** Assembles the Git router with runners from the centralized provider runtime service. */
export function createGitModule(externalDependencies: GitExternalDependencies) {
  return createGitRouter({
    fileSystem: fs,
    spawnProcess: spawn,
    resolveProjectPathById: (projectId) => projectsDb.getProjectPathById(projectId),
    // Push, pull and fetch to https github.com remotes use the user's active stored token.
    resolveGithubToken: (userId) => {
      const numericUserId = Number(userId);
      return Number.isInteger(numericUserId) ? githubTokensDb.getActiveGithubToken(numericUserId) : null;
    },
    ...externalDependencies,
  });
}
