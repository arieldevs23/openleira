import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import { sessionsDb } from '@/modules/database/index.js';
import type { IProviderModels } from '@/shared/interfaces.js';
import type {
  ProviderCurrentActiveModel,
  ProviderModelsDefinition,
} from '@/shared/types.js';
import {
  buildDefaultProviderCurrentActiveModel,
  getOpenCodeDatabasePath,
  readObjectRecord,
  readOptionalString,
} from '@/shared/utils.js';

/**
 * Curated OpenCode catalog shipped as immutable CloudCLI defaults.
 *
 * OpenCode routes by `<providerID>/<modelID>`, so this list mirrors the
 * providers `opencode models --verbose` reports: the OpenCode Zen gateway, the
 * OpenCode Go subscription gateway, and the Anthropic and OpenAI providers
 * OpenCode can address directly with the user's own credentials.
 */
export const OPENCODE_PREDEFINED_MODELS: ProviderModelsDefinition = {
  OPTIONS: [
    { value: 'opencode/gpt-5.6-sol', label: 'GPT 5.6 Sol', description: 'OpenCode Zen' },
    { value: 'opencode/gpt-5.6-terra', label: 'GPT 5.6 Terra', description: 'OpenCode Zen' },
    { value: 'opencode/gpt-5.6-luna', label: 'GPT 5.6 Luna', description: 'OpenCode Zen' },
    { value: 'opencode/gpt-5.5', label: 'GPT 5.5', description: 'OpenCode Zen' },
    { value: 'opencode/gpt-5.5-pro', label: 'GPT 5.5 Pro', description: 'OpenCode Zen' },
    { value: 'opencode/gpt-5.4', label: 'GPT 5.4', description: 'OpenCode Zen' },
    { value: 'opencode/gpt-5.4-pro', label: 'GPT 5.4 Pro', description: 'OpenCode Zen' },
    { value: 'opencode/gpt-5.4-mini', label: 'GPT 5.4 Mini', description: 'OpenCode Zen' },
    { value: 'opencode/gpt-5.4-nano', label: 'GPT 5.4 Nano', description: 'OpenCode Zen' },
    { value: 'opencode/gpt-5.3-codex', label: 'GPT 5.3 Codex', description: 'OpenCode Zen' },
    { value: 'opencode/gpt-5.3-codex-spark', label: 'GPT 5.3 Codex Spark', description: 'OpenCode Zen' },
    { value: 'opencode/gpt-5.2', label: 'GPT 5.2', description: 'OpenCode Zen' },
    { value: 'opencode/gpt-5.1', label: 'GPT 5.1', description: 'OpenCode Zen' },
    { value: 'opencode/gpt-5', label: 'GPT 5', description: 'OpenCode Zen' },
    { value: 'opencode/gpt-5-nano', label: 'GPT 5 Nano', description: 'OpenCode Zen' },
    { value: 'opencode/claude-fable-5', label: 'Claude Fable 5', description: 'OpenCode Zen' },
    { value: 'opencode/claude-opus-5', label: 'Claude Opus 5', description: 'OpenCode Zen' },
    { value: 'opencode/claude-opus-4-8', label: 'Claude Opus 4.8', description: 'OpenCode Zen' },
    { value: 'opencode/claude-opus-4-7', label: 'Claude Opus 4.7', description: 'OpenCode Zen' },
    { value: 'opencode/claude-opus-4-6', label: 'Claude Opus 4.6', description: 'OpenCode Zen' },
    { value: 'opencode/claude-opus-4-5', label: 'Claude Opus 4.5', description: 'OpenCode Zen' },
    { value: 'opencode/claude-sonnet-5', label: 'Claude Sonnet 5', description: 'OpenCode Zen' },
    { value: 'opencode/claude-sonnet-4-6', label: 'Claude Sonnet 4.6', description: 'OpenCode Zen' },
    { value: 'opencode/claude-sonnet-4-5', label: 'Claude Sonnet 4.5', description: 'OpenCode Zen' },
    { value: 'opencode/claude-haiku-4-5', label: 'Claude Haiku 4.5', description: 'OpenCode Zen' },
    { value: 'opencode/gemini-3.6-flash', label: 'Gemini 3.6 Flash', description: 'OpenCode Zen' },
    { value: 'opencode/gemini-3.5-flash', label: 'Gemini 3.5 Flash', description: 'OpenCode Zen' },
    { value: 'opencode/gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite', description: 'OpenCode Zen' },
    { value: 'opencode/gemini-3.1-pro', label: 'Gemini 3.1 Pro', description: 'OpenCode Zen' },
    { value: 'opencode/gemini-3-flash', label: 'Gemini 3 Flash', description: 'OpenCode Zen' },
    { value: 'opencode/grok-4.5', label: 'Grok 4.5', description: 'OpenCode Zen' },
    { value: 'opencode/grok-build-0.1', label: 'Grok Build 0.1', description: 'OpenCode Zen' },
    { value: 'opencode/qwen3.7-max', label: 'Qwen3.7 Max', description: 'OpenCode Zen' },
    { value: 'opencode/qwen3.7-plus', label: 'Qwen3.7 Plus', description: 'OpenCode Zen' },
    { value: 'opencode/qwen3.6-plus', label: 'Qwen3.6 Plus', description: 'OpenCode Zen' },
    { value: 'opencode/qwen3.5-plus', label: 'Qwen3.5 Plus', description: 'OpenCode Zen' },
    { value: 'opencode/deepseek-v4-pro', label: 'DeepSeek V4 Pro', description: 'OpenCode Zen' },
    { value: 'opencode/deepseek-v4-flash', label: 'DeepSeek V4 Flash', description: 'OpenCode Zen' },
    { value: 'opencode/minimax-m3', label: 'MiniMax M3', description: 'OpenCode Zen' },
    { value: 'opencode/minimax-m2.7', label: 'MiniMax M2.7', description: 'OpenCode Zen' },
    { value: 'opencode/minimax-m2.5', label: 'MiniMax M2.5', description: 'OpenCode Zen' },
    { value: 'opencode/glm-5.2', label: 'GLM 5.2', description: 'OpenCode Zen' },
    { value: 'opencode/glm-5.1', label: 'GLM 5.1', description: 'OpenCode Zen' },
    { value: 'opencode/kimi-k2.5', label: 'Kimi K2.5', description: 'OpenCode Zen' },
    { value: 'opencode/kimi-k2.6', label: 'Kimi K2.6', description: 'OpenCode Zen' },
    { value: 'opencode/kimi-k2.7-code', label: 'Kimi K2.7 Code', description: 'OpenCode Zen' },
    { value: 'opencode/kimi-k3', label: 'Kimi K3', description: 'OpenCode Zen' },
    { value: 'opencode/big-pickle', label: 'Big Pickle', description: 'OpenCode Zen · Free' },
    { value: 'opencode/mimo-v2.5-free', label: 'MiMo-V2.5 Free', description: 'OpenCode Zen · Free' },
    { value: 'opencode/laguna-s-2.1-free', label: 'Laguna S 2.1 Free', description: 'OpenCode Zen · Free' },
    { value: 'opencode/ling-3.0-flash-free', label: 'Ling-3.0-flash Free', description: 'OpenCode Zen · Free' },
    { value: 'opencode/north-mini-code-free', label: 'North Mini Code Free', description: 'OpenCode Zen · Free' },
    { value: 'opencode/nemotron-3-ultra-free', label: 'Nemotron 3 Ultra Free', description: 'OpenCode Zen · Free' },
    { value: 'opencode/deepseek-v4-flash-free', label: 'DeepSeek V4 Flash Free', description: 'OpenCode Zen · Free' },
    {
      value: 'opencode-go/grok-4.6',
      label: 'Grok 4.6',
      description: 'OpenCode Go',
      effort: {
        values: [{ value: 'low' }, { value: 'medium' }, { value: 'high' }, { value: 'xhigh' }],
      },
    },
    {
      value: 'opencode-go/glm-5.3-flash',
      label: 'GLM 5.3 Flash',
      description: 'OpenCode Go',
      effort: {
        values: [{ value: 'low' }, { value: 'high' }, { value: 'max' }],
      },
    },
    {
      value: 'opencode-go/glm-5.3',
      label: 'GLM 5.3',
      description: 'OpenCode Go',
      effort: {
        values: [{ value: 'low' }, { value: 'high' }, { value: 'max' }],
      },
    },
    {
      value: 'opencode-go/glm-5.2',
      label: 'GLM 5.2',
      description: 'OpenCode Go',
      effort: {
        values: [{ value: 'high' }, { value: 'max' }],
      },
    },
    { value: 'opencode-go/glm-5.1', label: 'GLM 5.1', description: 'OpenCode Go' },
    {
      value: 'opencode-go/gpt-5.6-luna',
      label: 'GPT 5.6 Luna',
      description: 'OpenCode Go',
      effort: {
        values: [
          { value: 'none' },
          { value: 'low' },
          { value: 'medium' },
          { value: 'high' },
          { value: 'xhigh' },
          { value: 'max' },
        ],
      },
    },
    {
      value: 'opencode-go/kimi-k3',
      label: 'Kimi K3',
      description: 'OpenCode Go',
      effort: {
        values: [{ value: 'max' }],
      },
    },
    { value: 'opencode-go/kimi-k2.7-code', label: 'Kimi K2.7 Code', description: 'OpenCode Go' },
    { value: 'opencode-go/kimi-k2.6', label: 'Kimi K2.6', description: 'OpenCode Go' },
    {
      value: 'opencode-go/longcat-2.0',
      label: 'LongCat 2.0',
      description: 'OpenCode Go',
      effort: {
        values: [{ value: 'low' }, { value: 'medium' }, { value: 'high' }],
      },
    },
    { value: 'opencode-go/mimo-v2.5', label: 'MiMo V2.5', description: 'OpenCode Go' },
    { value: 'opencode-go/mimo-v2.5-pro', label: 'MiMo V2.5 Pro', description: 'OpenCode Go' },
    {
      value: 'opencode-go/minimax-m3',
      label: 'MiniMax M3',
      description: 'OpenCode Go',
      effort: {
        values: [{ value: 'none' }, { value: 'thinking' }],
      },
    },
    { value: 'opencode-go/minimax-m2.7', label: 'MiniMax M2.7', description: 'OpenCode Go' },
    {
      value: 'opencode-go/muse-spark-1.3-contributor',
      label: 'Muse Spark 1.3 Contributor',
      description: 'OpenCode Go',
      effort: {
        values: [
          { value: 'minimal' },
          { value: 'low' },
          { value: 'medium' },
          { value: 'high' },
          { value: 'xhigh' },
        ],
      },
    },
    {
      value: 'opencode-go/muse-spark-1.2-contributor',
      label: 'Muse Spark 1.2 Contributor',
      description: 'OpenCode Go',
      effort: {
        values: [
          { value: 'minimal' },
          { value: 'low' },
          { value: 'medium' },
          { value: 'high' },
          { value: 'xhigh' },
        ],
      },
    },
    {
      value: 'opencode-go/qwen3.8-max',
      label: 'Qwen3.8 Max',
      description: 'OpenCode Go',
      effort: {
        values: [{ value: 'low' }, { value: 'medium' }, { value: 'xhigh' }],
      },
    },
    {
      value: 'opencode-go/qwen3.8-flash',
      label: 'Qwen3.8 Flash',
      description: 'OpenCode Go',
      effort: {
        values: [{ value: 'low' }, { value: 'medium' }, { value: 'xhigh' }],
      },
    },
    { value: 'opencode-go/qwen3.7-max', label: 'Qwen3.7 Max', description: 'OpenCode Go' },
    { value: 'opencode-go/qwen3.7-plus', label: 'Qwen3.7 Plus', description: 'OpenCode Go' },
    { value: 'opencode-go/qwen3.6-plus', label: 'Qwen3.6 Plus', description: 'OpenCode Go' },
    {
      value: 'opencode-go/deepseek-v4-pro',
      label: 'DeepSeek V4 Pro',
      description: 'OpenCode Go',
      effort: {
        values: [{ value: 'high' }, { value: 'max' }],
      },
    },
    {
      value: 'opencode-go/deepseek-v4-flash',
      label: 'DeepSeek V4 Flash',
      description: 'OpenCode Go',
      effort: {
        values: [{ value: 'low' }, { value: 'high' }, { value: 'max' }],
      },
    },
    {
      value: 'opencode-go/deepseek-v4-flash-vision-exp',
      label: 'DeepSeek V4 Flash Vision Exp',
      description: 'OpenCode Go',
      effort: {
        values: [{ value: 'low' }, { value: 'high' }, { value: 'max' }],
      },
    },
    {
      value: 'opencode-go/hy4-preview',
      label: 'Hy4 Preview',
      description: 'OpenCode Go',
      effort: {
        values: [{ value: 'none' }, { value: 'high' }],
      },
    },
    {
      value: 'opencode-go/hy3',
      label: 'Hy3',
      description: 'OpenCode Go',
      effort: {
        values: [{ value: 'none' }, { value: 'low' }, { value: 'high' }],
      },
    },
    {
      value: 'opencode-go/omen-alpha',
      label: 'Omen Alpha',
      description: 'OpenCode Go',
      effort: {
        values: [{ value: 'low' }, { value: 'high' }],
      },
    },
    { value: 'anthropic/claude-opus-5', label: 'Claude Opus 5', description: 'Anthropic' },
    { value: 'anthropic/claude-opus-5-fast', label: 'Claude Opus 5 Fast', description: 'Anthropic' },
    { value: 'anthropic/claude-fable-5', label: 'Claude Fable 5', description: 'Anthropic' },
    { value: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5', description: 'Anthropic' },
    { value: 'anthropic/claude-opus-4-8', label: 'Claude Opus 4.8', description: 'Anthropic' },
    { value: 'anthropic/claude-opus-4-8-fast', label: 'Claude Opus 4.8 Fast', description: 'Anthropic' },
    { value: 'anthropic/claude-opus-4-7', label: 'Claude Opus 4.7', description: 'Anthropic' },
    { value: 'anthropic/claude-opus-4-7-fast', label: 'Claude Opus 4.7 Fast', description: 'Anthropic' },
    { value: 'anthropic/claude-opus-4-6', label: 'Claude Opus 4.6', description: 'Anthropic' },
    { value: 'anthropic/claude-opus-4-6-fast', label: 'Claude Opus 4.6 Fast', description: 'Anthropic' },
    { value: 'anthropic/claude-opus-4-5', label: 'Claude Opus 4.5 (latest)', description: 'Anthropic' },
    { value: 'anthropic/claude-opus-4-5-20251101', label: 'Claude Opus 4.5', description: 'Anthropic' },
    { value: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6', description: 'Anthropic' },
    { value: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (latest)', description: 'Anthropic' },
    { value: 'anthropic/claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5', description: 'Anthropic' },
    { value: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5 (latest)', description: 'Anthropic' },
    { value: 'anthropic/claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', description: 'Anthropic' },
    { value: 'openai/gpt-5.6', label: 'GPT-5.6', description: 'OpenAI' },
    { value: 'openai/gpt-5.6-fast', label: 'GPT-5.6 Fast', description: 'OpenAI' },
    { value: 'openai/gpt-5.6-pro', label: 'GPT-5.6 Pro', description: 'OpenAI' },
    { value: 'openai/gpt-5.6-sol', label: 'GPT-5.6 Sol', description: 'OpenAI' },
    { value: 'openai/gpt-5.6-sol-fast', label: 'GPT-5.6 Sol Fast', description: 'OpenAI' },
    { value: 'openai/gpt-5.6-sol-pro', label: 'GPT-5.6 Sol Pro', description: 'OpenAI' },
    { value: 'openai/gpt-5.6-terra', label: 'GPT-5.6 Terra', description: 'OpenAI' },
    { value: 'openai/gpt-5.6-terra-fast', label: 'GPT-5.6 Terra Fast', description: 'OpenAI' },
    { value: 'openai/gpt-5.6-terra-pro', label: 'GPT-5.6 Terra Pro', description: 'OpenAI' },
    { value: 'openai/gpt-5.6-luna', label: 'GPT-5.6 Luna', description: 'OpenAI' },
    { value: 'openai/gpt-5.6-luna-fast', label: 'GPT-5.6 Luna Fast', description: 'OpenAI' },
    { value: 'openai/gpt-5.6-luna-pro', label: 'GPT-5.6 Luna Pro', description: 'OpenAI' },
    { value: 'openai/gpt-5.5', label: 'GPT-5.5', description: 'OpenAI' },
    { value: 'openai/gpt-5.5-fast', label: 'GPT-5.5 Fast', description: 'OpenAI' },
    { value: 'openai/gpt-5.4', label: 'GPT-5.4', description: 'OpenAI' },
    { value: 'openai/gpt-5.4-fast', label: 'GPT-5.4 Fast', description: 'OpenAI' },
    { value: 'openai/gpt-5.4-mini', label: 'GPT-5.4 mini', description: 'OpenAI' },
    { value: 'openai/gpt-5.4-mini-fast', label: 'GPT-5.4 mini Fast', description: 'OpenAI' },
    { value: 'openai/gpt-5.3-codex-spark', label: 'GPT-5.3 Codex Spark', description: 'OpenAI' },
  ],
  DEFAULT: 'opencode/gpt-5.6-terra',
};

/** Global OpenCode config files, in the order the CLI loads them. */
const OPENCODE_CONFIG_FILES = ['config.json', 'opencode.json', 'opencode.jsonc'];

/** Provider API keys OpenCode reads straight from the environment. */
const OPENCODE_ENV_PROVIDER_IDS: Record<string, string> = {
  OPENCODE_API_KEY: 'opencode',
  ANTHROPIC_API_KEY: 'anthropic',
  OPENAI_API_KEY: 'openai',
};

const readOpenCodeJsonFile = async (filePath: string): Promise<Record<string, unknown> | null> => {
  try {
    return readObjectRecord(JSON.parse(await readFile(filePath, 'utf8')));
  } catch {
    // Missing, unreadable, or comment-bearing (.jsonc) files simply contribute
    // nothing; the auth store is the authoritative source below.
    return null;
  }
};

/**
 * Lists the upstream providers this OpenCode install can actually route to.
 *
 * OpenCode resolves `<providerID>/<modelID>` against the providers the user has
 * connected, and rejects anything else outright - `Model
 * opencode/claude-sonnet-4-6 is not valid` is what a run gets for asking for an
 * OpenCode Zen model on a machine that only has an Anthropic key. The curated
 * catalog spans every provider OpenCode can address, so it has to be narrowed
 * to this machine's providers before it reaches the model picker.
 *
 * Returns null when nothing can be read, so the caller keeps the full catalog
 * rather than leaving the picker empty. Providers declared only in a
 * project-level `opencode.json` are not visible here; the null fallback and the
 * env-key sweep keep those installs on the full list.
 */
const readConnectedOpenCodeProviderIds = async (): Promise<Set<string> | null> => {
  const providerIds = new Set<string>();
  const configDir = path.join(os.homedir(), '.config', 'opencode');

  const auth = await readOpenCodeJsonFile(
    path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json'),
  );
  for (const [providerId, credential] of Object.entries(auth ?? {})) {
    if (readObjectRecord(credential)) {
      providerIds.add(providerId);
    }
  }

  for (const configFile of OPENCODE_CONFIG_FILES) {
    const config = await readOpenCodeJsonFile(path.join(configDir, configFile));
    for (const providerId of Object.keys(readObjectRecord(config?.provider) ?? {})) {
      providerIds.add(providerId);
    }
  }

  for (const [envKey, providerId] of Object.entries(OPENCODE_ENV_PROVIDER_IDS)) {
    if (readOptionalString(process.env[envKey])) {
      providerIds.add(providerId);
    }
  }

  return providerIds.size > 0 ? providerIds : null;
};

/** OpenCode Zen's OpenAI-compatible model listing; only ids come back, no labels. */
const OPENCODE_ZEN_MODELS_URL = 'https://opencode.ai/zen/v1/models';
const OPENCODE_ZEN_FETCH_TIMEOUT_MS = 5_000;
const OPENCODE_ZEN_CACHE_TTL_MS = 10 * 60 * 1_000;

let zenModelIdsCache: { ids: Set<string>; expiresAt: number } | null = null;

/** The Zen API key OpenCode itself would use: its auth store first, then the env. */
const readOpenCodeZenApiKey = async (): Promise<string | null> => {
  const auth = await readOpenCodeJsonFile(
    path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json'),
  );
  const zenAuth = readObjectRecord(auth?.opencode);
  return readOptionalString(zenAuth?.key) ?? readOptionalString(process.env.OPENCODE_API_KEY) ?? null;
};

/**
 * Lists the model ids Zen serves right now.
 *
 * Zen retires and renames models (the free tier churns weekly), so the curated
 * catalog goes stale and a run on a retired id fails with an opaque
 * "Unexpected server error". Returns null when the key is missing or the
 * request fails, so the caller keeps the curated list instead of an empty one.
 */
const fetchOpenCodeZenModelIds = async (fetchImpl: typeof fetch): Promise<Set<string> | null> => {
  if (zenModelIdsCache && zenModelIdsCache.expiresAt > Date.now()) {
    return zenModelIdsCache.ids;
  }

  const apiKey = await readOpenCodeZenApiKey();
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetchImpl(OPENCODE_ZEN_MODELS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(OPENCODE_ZEN_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    const body = readObjectRecord(await response.json());
    const ids = new Set<string>();
    for (const entry of Array.isArray(body?.data) ? body.data : []) {
      const id = readOptionalString(readObjectRecord(entry)?.id);
      if (id) {
        ids.add(id);
      }
    }
    if (ids.size === 0) {
      return null;
    }
    zenModelIdsCache = { ids, expiresAt: Date.now() + OPENCODE_ZEN_CACHE_TTL_MS };
    return ids;
  } catch {
    return null;
  }
};

/** "nemotron-3.5-lightning-free" -> "Nemotron 3.5 Lightning Free". */
const labelFromZenModelId = (modelId: string): string => modelId
  .split('-')
  .filter(Boolean)
  .map((word) => (/^[a-z]/.test(word) ? word[0].toUpperCase() + word.slice(1) : word))
  .join(' ');

/**
 * Replaces the curated Zen entries with what Zen actually serves: curated
 * labels are kept for ids that still exist, retired ids are dropped, and new
 * ids are appended with a label derived from the id. Non-Zen providers are
 * untouched.
 */
const reconcileOpenCodeZenModels = (
  definition: ProviderModelsDefinition,
  liveZenIds: Set<string> | null,
): ProviderModelsDefinition => {
  if (!liveZenIds) {
    return definition;
  }

  const isZen = (value: string): boolean => value.startsWith('opencode/');
  const options = definition.OPTIONS.filter(
    (option) => !isZen(option.value) || liveZenIds.has(option.value.slice('opencode/'.length)),
  );
  const curatedZenIds = new Set(options.filter((option) => isZen(option.value)).map((option) => option.value));
  for (const id of liveZenIds) {
    const value = `opencode/${id}`;
    if (!curatedZenIds.has(value)) {
      options.push({ value, label: labelFromZenModelId(id), description: 'OpenCode Zen' });
    }
  }
  if (options.length === 0) {
    return definition;
  }

  return {
    ...definition,
    OPTIONS: options,
    DEFAULT: options.some((option) => option.value === definition.DEFAULT)
      ? definition.DEFAULT
      : options[0].value,
  };
};

/**
 * Narrows the curated catalog to the providers OpenCode can route to.
 *
 * The default has to move with the list: leaving it on an OpenCode Zen model
 * would hand every new session a model the CLI refuses to run.
 */
const filterOpenCodeModelsByProvider = (
  definition: ProviderModelsDefinition,
  connectedProviderIds: Set<string> | null,
): ProviderModelsDefinition => {
  if (!connectedProviderIds) {
    return definition;
  }

  const options = definition.OPTIONS.filter(
    (option) => connectedProviderIds.has(option.value.split('/')[0]),
  );
  if (options.length === 0) {
    return definition;
  }

  return {
    ...definition,
    OPTIONS: options,
    DEFAULT: options.some((option) => option.value === definition.DEFAULT)
      ? definition.DEFAULT
      : options[0].value,
  };
};

const parseOpenCodeSessionModelValue = (rawModel: unknown): string | null => {
  if (typeof rawModel === 'string') {
    const trimmed = rawModel.trim();
    if (!trimmed) {
      return null;
    }

    try {
      return parseOpenCodeSessionModelValue(JSON.parse(trimmed));
    } catch {
      return trimmed;
    }
  }

  const record = readObjectRecord(rawModel);
  if (!record) {
    return null;
  }

  const modelId = readOptionalString(record.id)
    ?? readOptionalString(record.model)
    ?? readOptionalString(record.name)
    ?? readOptionalString(record.value);
  if (!modelId) {
    return null;
  }

  // OpenCode persists the provider and model id in separate fields (for
  // example {"id":"z-ai/glm-5.3-flash","providerID":"openrouter"}), and its
  // CLI's `--model` flag only accepts the composed `<providerID>/<modelID>`
  // form. Compose it here so a resumed session resolves the same model
  // instead of failing with an unknown-model error.
  const providerId = readOptionalString(record.providerID)
    ?? readOptionalString(record.providerId);
  if (providerId && !modelId.startsWith(`${providerId}/`)) {
    return `${providerId}/${modelId}`;
  }

  return modelId;
};

/** Provider registry model adapter for OpenCode predefined models and session metadata. */
export class OpenCodeProviderModels implements IProviderModels {
  // Injectable so tests can answer the Zen listing without the network.
  constructor(private readonly fetchImpl: typeof fetch = globalThis.fetch) {}

  async getSupportedModels(): Promise<ProviderModelsDefinition> {
    const connectedProviderIds = await readConnectedOpenCodeProviderIds();
    const catalog = filterOpenCodeModelsByProvider(OPENCODE_PREDEFINED_MODELS, connectedProviderIds);
    if (connectedProviderIds && !connectedProviderIds.has('opencode')) {
      return catalog;
    }
    return reconcileOpenCodeZenModels(catalog, await fetchOpenCodeZenModelIds(this.fetchImpl));
  }

  async getCurrentActiveModel(sessionId?: string): Promise<ProviderCurrentActiveModel> {
    if (!sessionId?.trim()) {
      return buildDefaultProviderCurrentActiveModel(await this.getSupportedModels());
    }

    // OpenCode's `session` table is keyed by its own session id, so the stable
    // app id has to be translated first; sessions discovered on disk store the
    // provider id in both columns and resolve to themselves.
    const providerSessionId = sessionsDb.getSessionById(sessionId)?.provider_session_id ?? sessionId;

    try {
      const dbPath = getOpenCodeDatabasePath();
      const db = new Database(dbPath, { readonly: true, fileMustExist: true });

      try {
        const row = db.prepare(`
          SELECT
            s.id AS sessionId,
            s.model AS model,
            s.agent AS agent,
            s.directory AS directory,
            s.time_updated AS timeUpdated,
            s.time_created AS timeCreated
          FROM session s
          WHERE s.id = ?
          ORDER BY COALESCE(s.time_updated, s.time_created, 0) DESC
          LIMIT 1
        `).get(providerSessionId) as {
          sessionId?: string;
          model?: unknown;
          agent?: string | null;
          directory?: string | null;
          timeUpdated?: number | null;
          timeCreated?: number | null;
        } | undefined;

        const model = parseOpenCodeSessionModelValue(row?.model);
        if (model) {
          return {
            model,
          };
        }
      } finally {
        db.close();
      }
    } catch {
      // Fall through to the curated default when OpenCode session lookup fails.
    }

    return buildDefaultProviderCurrentActiveModel(await this.getSupportedModels());
  }
}
