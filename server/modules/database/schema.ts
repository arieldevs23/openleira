const USER_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    is_active BOOLEAN DEFAULT 1,
    git_name TEXT,
    git_email TEXT,
    has_completed_onboarding BOOLEAN DEFAULT 0
);
`;

export const API_KEYS_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    key_name TEXT NOT NULL,
    api_key TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used DATETIME,
    is_active BOOLEAN DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

export const USER_CREDENTIALS_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS user_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    credential_name TEXT NOT NULL,
    credential_type TEXT NOT NULL, -- 'github_token', 'gitlab_token', 'bitbucket_token', etc.
    credential_value TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

export const USER_NOTIFICATION_PREFERENCES_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS user_notification_preferences (
    user_id INTEGER PRIMARY KEY,
    preferences_json TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

export const VAPID_KEYS_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS vapid_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_key TEXT NOT NULL,
    private_key TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

export const PUSH_SUBSCRIPTIONS_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    keys_p256dh TEXT NOT NULL,
    keys_auth TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

export const NOTIFICATION_CHANNEL_ENDPOINTS_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS notification_channel_endpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    channel TEXT NOT NULL,
    endpoint_id TEXT NOT NULL,
    label TEXT,
    metadata_json TEXT,
    enabled BOOLEAN DEFAULT 1,
    last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, channel, endpoint_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

export const PROJECTS_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projects (
    project_id TEXT PRIMARY KEY NOT NULL,
    project_path TEXT NOT NULL UNIQUE,
    custom_project_name TEXT DEFAULT NULL,
    isStarred BOOLEAN DEFAULT 0,
    isArchived BOOLEAN DEFAULT 0
);
`;

export const SCHEDULED_MESSAGES_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS scheduled_messages (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    session_id TEXT NOT NULL,
    content TEXT NOT NULL,
    -- Composer preferences (model, effort, permission mode, attachments) as
    -- they were when the message was scheduled, so it runs the way the user
    -- set it up rather than however the session is configured hours later.
    options TEXT NOT NULL DEFAULT '{}',
    -- UTC. The client sends an absolute instant so the schedule does not move
    -- when the user changes time zone between scheduling and firing.
    scheduled_for DATETIME NOT NULL,
    -- pending | sent | failed | cancelled
    status TEXT NOT NULL DEFAULT 'pending',
    -- Why a failed one failed, shown next to it in the composer.
    failure_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);
`;

export const SESSIONS_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'claude',
    -- The session id used by the provider CLI/SDK on disk (JSONL file name,
    -- store.db folder, sqlite row id, ...). \`session_id\` is the stable
    -- app-facing id that the frontend uses for the whole session lifetime;
    -- \`provider_session_id\` is filled in once the provider announces its own
    -- id mid-run, or equals \`session_id\` for sessions discovered on disk.
    provider_session_id TEXT,
    custom_name TEXT,
    project_path TEXT,
    jsonl_path TEXT,
    -- Model and reasoning effort this session runs with. Written when the user
    -- changes either selection and on every send, so reopening a session
    -- restores its exact runtime configuration instead of provider defaults.
    model TEXT,
    effort TEXT,
    -- The app session this one was branched from, NULL for sessions created
    -- normally. Informational only: a fork is a fully independent provider
    -- session, and deleting the source does not affect it.
    forked_from_session_id TEXT,
    isArchived BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (session_id),
    FOREIGN KEY (project_path) REFERENCES projects(project_path)
    ON DELETE SET NULL
    ON UPDATE CASCADE
);
`;

export const LAST_SCANNED_AT_SQL = `
CREATE TABLE IF NOT EXISTS scan_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_scanned_at TIMESTAMP NULL
);
`;

export const APP_CONFIG_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

/**
 * Persistent custom-model library used by the Providers module.
 *
 * Only user-created models are stored here. Predefined models remain source-
 * controlled in each provider's `-models.provider.ts` adapter so they can be
 * updated without migrating application data. `model_id` is unique only within
 * a provider because different CLIs can accept the same identifier.
 */
export const PROVIDER_MODELS_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS provider_models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL CHECK (provider IN ('claude', 'cursor', 'codex', 'opencode')),
    model_id TEXT NOT NULL,
    model_name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, model_id)
);
`;

/**
 * Per-user application preferences that used to live in browser localStorage.
 *
 * One row per (user, key); `preference_value` is always a JSON document so a
 * key can hold a scalar (`"dark"`), a flag (`false`) or a whole settings blob
 * without the schema having to know which. Keeping them server-side is what
 * makes a preference follow the user from one device to another.
 */
export const USER_PREFERENCES_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id INTEGER NOT NULL,
    preference_key TEXT NOT NULL,
    preference_value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, preference_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

/**
 * Unsent composer text and queued messages, per user and per chat scope.
 *
 * `draft_scope` is a session id, or `project:<projectId>` for a chat that has
 * not been sent yet and therefore has no session. Storing this server-side is
 * what lets a message typed on a laptop be finished on a phone.
 */
export const SESSION_DRAFTS_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS session_drafts (
    user_id INTEGER NOT NULL,
    draft_scope TEXT NOT NULL,
    draft_text TEXT NOT NULL DEFAULT '',
    queued_message TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, draft_scope),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

/**
 * Provider sessions an app session has moved off, and must never move back to.
 *
 * Editing a message on a provider that cannot resume a transcript partway
 * (Codex) is done by branching: the conversation is copied up to the edited
 * turn and the app session follows the copy. The original transcript is left
 * on disk untouched — nothing is deleted — but it is no longer the session's,
 * and the indexer would otherwise rediscover it on its next full scan and hand
 * the session back to the version the user edited away from.
 */
export const SUPERSEDED_PROVIDER_SESSIONS_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS superseded_provider_sessions (
    provider_session_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    session_id TEXT NOT NULL,
    -- The transcript the session left behind. Recorded because the session row
    -- stops pointing at it, and "delete this conversation from disk" has to
    -- reach every file the conversation ever lived in.
    jsonl_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (provider_session_id, provider)
);
`;

/**
 * Kantor AI (AI office) tables, owned by the Office module.
 *
 * One office per project path; an office holds divisions (rooms), each with
 * exactly one agent. A case is the user's main request, broken by the
 * coordinator into tasks, and `office_messages` is the message bus every
 * hand-off between divisions goes through. Tables are prefixed with `office_`
 * because `case` is an SQL keyword and `task` is too generic to own globally.
 *
 * Timestamps are ISO-8601 strings written by the repositories, so the
 * frontend can parse them without guessing the time zone.
 */
export const OFFICES_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS offices (
    id TEXT PRIMARY KEY NOT NULL,
    project_path TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    -- Language the seeded divisions were written in and agents answer in.
    locale TEXT NOT NULL DEFAULT 'id',
    -- What kind of work the workspace does: coding, content, finance or admin.
    kind TEXT NOT NULL DEFAULT 'coding',
    -- How many task/audit sessions may run at the same time for one case.
    max_parallel INTEGER NOT NULL DEFAULT 2,
    -- Permission mode every office session runs with.
    permission_mode TEXT NOT NULL DEFAULT 'bypassPermissions',
    -- The user has seen the one-time bypass-permissions warning.
    permission_warning_ack BOOLEAN NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_path) REFERENCES projects(project_path)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);
`;

export const OFFICE_DIVISIONS_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS office_divisions (
    id TEXT PRIMARY KEY NOT NULL,
    office_id TEXT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#2551BD',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_coordinator BOOLEAN NOT NULL DEFAULT 0,
    is_audit BOOLEAN NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    -- Canvas position the user dragged the node to; NULL means automatic layout.
    pos_x REAL,
    pos_y REAL,
    UNIQUE(office_id, slug),
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
);
`;

export const OFFICE_AGENTS_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS office_agents (
    id TEXT PRIMARY KEY NOT NULL,
    -- Exactly one agent per division.
    division_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role_prompt TEXT NOT NULL DEFAULT '',
    -- Provider and model stay NULL until the user picks them; a case cannot
    -- start while an enabled agent has none.
    provider TEXT,
    model TEXT,
    allowed_tools TEXT NOT NULL DEFAULT '[]',
    skills TEXT NOT NULL DEFAULT '[]',
    enabled BOOLEAN NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (division_id) REFERENCES office_divisions(id) ON DELETE CASCADE
);
`;

export const OFFICE_CASES_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS office_cases (
    id TEXT PRIMARY KEY NOT NULL,
    office_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft', 'running', 'waiting_user', 'done', 'failed')),
    -- Why a case is waiting_user: paused | question | interrupted.
    waiting_reason TEXT,
    -- Where the orchestration stands: planning | executing | finalizing.
    phase TEXT,
    coordinator_busy BOOLEAN NOT NULL DEFAULT 0,
    -- The coordinator keeps one provider session for the whole case, so every
    -- turn (plan, check-in, final summary) remembers the earlier ones.
    coordinator_session_id TEXT,
    final_summary TEXT,
    error TEXT,
    -- A quick task goes straight to this division's agent: no plan, no audit, no summary turn.
    quick_division_id TEXT,
    -- One item of a work list: it starts by itself once this earlier item has finished.
    follows_case_id TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
);
`;

export const OFFICE_TASKS_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS office_tasks (
    id TEXT PRIMARY KEY NOT NULL,
    case_id TEXT NOT NULL,
    division_id TEXT,
    -- The failed task this one replaces, when the coordinator re-plans.
    parent_task_id TEXT,
    -- Short handle (T1, T2, ...) the coordinator uses for dependencies.
    ref TEXT NOT NULL,
    title TEXT NOT NULL,
    instruction TEXT NOT NULL DEFAULT '',
    -- JSON array of task ids that must be done first.
    depends_on TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'queued'
      CHECK (status IN ('queued', 'running', 'review', 'done', 'failed', 'blocked')),
    -- Failed audits so far; the third failure fails the task.
    attempts INTEGER NOT NULL DEFAULT 0,
    result_summary TEXT,
    audit_notes TEXT,
    -- App session ids of the provider sessions that did the work and the audit.
    session_id TEXT,
    audit_session_id TEXT,
    error TEXT,
    -- JSON array of files the agent wrote or edited for this task.
    changed_files TEXT NOT NULL DEFAULT '[]',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    UNIQUE(case_id, ref),
    FOREIGN KEY (case_id) REFERENCES office_cases(id) ON DELETE CASCADE,
    FOREIGN KEY (division_id) REFERENCES office_divisions(id) ON DELETE SET NULL,
    FOREIGN KEY (parent_task_id) REFERENCES office_tasks(id) ON DELETE SET NULL
);
`;

export const OFFICE_FLOW_EDGES_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS office_flow_edges (
    office_id TEXT NOT NULL,
    -- Work of the target division waits for the work of the source division.
    from_division_id TEXT NOT NULL,
    to_division_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (from_division_id, to_division_id),
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE,
    FOREIGN KEY (from_division_id) REFERENCES office_divisions(id) ON DELETE CASCADE,
    FOREIGN KEY (to_division_id) REFERENCES office_divisions(id) ON DELETE CASCADE
);
`;

export const OFFICE_SKILL_NODES_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS office_skill_nodes (
    id TEXT PRIMARY KEY NOT NULL,
    office_id TEXT NOT NULL,
    -- The installed skill this node stands for; several nodes may show the same skill.
    skill_name TEXT NOT NULL,
    pos_x REAL,
    pos_y REAL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
);
`;

export const OFFICE_SHAPES_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS office_shapes (
    id TEXT PRIMARY KEY NOT NULL,
    office_id TEXT NOT NULL,
    -- rect | rounded | ellipse | diamond | text; drawn by the user, never read by the orchestrator.
    kind TEXT NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    width REAL NOT NULL,
    height REAL NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    fill TEXT,
    stroke TEXT,
    text_color TEXT,
    font_size INTEGER NOT NULL DEFAULT 14,
    z INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
);
`;

export const OFFICE_SOLO_SESSIONS_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS office_solo_sessions (
    -- A chat the user had on their own in a workspace's solo view; team-run
    -- sessions of the same project are never listed here.
    session_id TEXT PRIMARY KEY NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);
`;

export const OFFICE_SKILL_LINKS_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS office_skill_links (
    -- A division linked to a skill node on the canvas has that skill.
    skill_node_id TEXT NOT NULL,
    division_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (skill_node_id, division_id),
    FOREIGN KEY (skill_node_id) REFERENCES office_skill_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (division_id) REFERENCES office_divisions(id) ON DELETE CASCADE
);
`;

export const OFFICE_MESSAGES_TABLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS office_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id TEXT NOT NULL,
    task_id TEXT,
    -- NULL sender is the user; NULL recipient is the user / a broadcast.
    from_division_id TEXT,
    to_division_id TEXT,
    kind TEXT NOT NULL
      CHECK (kind IN ('assign', 'result', 'question', 'audit_pass', 'audit_fail', 'note')),
    payload TEXT NOT NULL DEFAULT '{}',
    -- Set once the recipient agent has been given the message (notes).
    read_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (case_id) REFERENCES office_cases(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES office_tasks(id) ON DELETE SET NULL,
    FOREIGN KEY (from_division_id) REFERENCES office_divisions(id) ON DELETE SET NULL,
    FOREIGN KEY (to_division_id) REFERENCES office_divisions(id) ON DELETE SET NULL
);
`;

export const INIT_SCHEMA_SQL = `
-- Initialize authentication database
PRAGMA foreign_keys = ON;

${USER_TABLE_SCHEMA_SQL}
-- Indexes for performance for user lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

${API_KEYS_TABLE_SCHEMA_SQL}
CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(api_key);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);

${USER_CREDENTIALS_TABLE_SCHEMA_SQL}
CREATE INDEX IF NOT EXISTS idx_user_credentials_user_id ON user_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_user_credentials_type ON user_credentials(credential_type);
CREATE INDEX IF NOT EXISTS idx_user_credentials_active ON user_credentials(is_active);

${USER_NOTIFICATION_PREFERENCES_TABLE_SCHEMA_SQL}
CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_user_id ON user_notification_preferences(user_id);

${VAPID_KEYS_TABLE_SCHEMA_SQL}

${PUSH_SUBSCRIPTIONS_TABLE_SCHEMA_SQL}
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

${NOTIFICATION_CHANNEL_ENDPOINTS_TABLE_SCHEMA_SQL}
CREATE INDEX IF NOT EXISTS idx_notification_channel_endpoints_user_channel ON notification_channel_endpoints(user_id, channel);
CREATE INDEX IF NOT EXISTS idx_notification_channel_endpoints_enabled ON notification_channel_endpoints(enabled);

${PROJECTS_TABLE_SCHEMA_SQL}
-- NOTE: These indexes are created in migrations after legacy table-shape repairs.
-- Creating them here can fail on upgraded installs where projects lacks those columns.

${SESSIONS_TABLE_SCHEMA_SQL}
CREATE INDEX IF NOT EXISTS idx_session_ids_lookup ON sessions(session_id);
-- NOTE: This index is created in migrations after sessions is rebuilt to include project_path.
-- Creating it here can fail on upgraded installs where the legacy sessions table has no project_path.

${LAST_SCANNED_AT_SQL}

${APP_CONFIG_TABLE_SCHEMA_SQL}

${PROVIDER_MODELS_TABLE_SCHEMA_SQL}
CREATE INDEX IF NOT EXISTS idx_provider_models_provider_order
ON provider_models(provider, sort_order, id);

${USER_PREFERENCES_TABLE_SCHEMA_SQL}

${SESSION_DRAFTS_TABLE_SCHEMA_SQL}

${SUPERSEDED_PROVIDER_SESSIONS_TABLE_SCHEMA_SQL}
`;
