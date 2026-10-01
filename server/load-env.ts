// Load environment variables from .env before other imports execute.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

// This bootstrap cannot import shared/utils.ts: that module reads environment
// defaults during evaluation, before this file has loaded `.env`.
function getBootstrapApplicationRoot(importMetaUrl: string) {
  const moduleDirectory = path.dirname(fileURLToPath(importMetaUrl));
  let serverRoot = moduleDirectory;
  while (path.basename(serverRoot) !== 'server') {
    const parent = path.dirname(serverRoot);
    if (parent === serverRoot) throw new Error('Could not resolve server root');
    serverRoot = parent;
  }
  const parent = path.dirname(serverRoot);
  return path.basename(parent) === 'dist-server' ? path.dirname(parent) : parent;
}

// Resolve the repo/app root via the nearest /server folder so this file keeps finding the
// same top-level .env file from both /server/load-env.ts and /dist-server/server/load-env.js.
const APP_ROOT = getBootstrapApplicationRoot(import.meta.url);

try {
  const envPath = path.join(APP_ROOT, '.env');
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const [key, ...valueParts] = trimmedLine.split('=');
      if (key && valueParts.length > 0 && !process.env[key]) {
        process.env[key] = valueParts.join('=').trim();
      }
    }
  });
} catch (e: any) {
  console.error('No .env file found or error reading it:', e.message);
}

// Before the rename to OpenLeira the user data folder was ~/.cloudcli. Move it
// once to ~/.openleira so the database, uploads and plugins carry over; when the
// move is not possible (another process holds it, different device) the old
// folder is left alone and the new one starts empty.
const DATA_DIRECTORY = path.join(os.homedir(), '.openleira');
const LEGACY_DATA_DIRECTORY = path.join(os.homedir(), '.cloudcli');
try {
  if (!fs.existsSync(DATA_DIRECTORY) && fs.existsSync(LEGACY_DATA_DIRECTORY)) {
    fs.renameSync(LEGACY_DATA_DIRECTORY, DATA_DIRECTORY);
    console.log(`Moved the data folder from ${LEGACY_DATA_DIRECTORY} to ${DATA_DIRECTORY}`);
  }
} catch (e: any) {
  console.error(`Could not move ${LEGACY_DATA_DIRECTORY} to ${DATA_DIRECTORY}:`, e.message);
}

// Keep the default database in a stable user-level location so rebuilding dist-server
// never changes where the backend stores auth.db when DATABASE_PATH is not set explicitly.
const DEFAULT_DATABASE_PATH = path.join(DATA_DIRECTORY, 'auth.db');

if (!process.env.DATABASE_PATH) {
  process.env.DATABASE_PATH = DEFAULT_DATABASE_PATH;
}
