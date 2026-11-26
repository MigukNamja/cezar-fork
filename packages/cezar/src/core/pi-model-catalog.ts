import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { agentHomePaths } from '../paths.ts';
import type { ModelOption } from './runner-model-catalog.ts';

export interface PiModelDiscoveryOptions {
  env?: NodeJS.ProcessEnv;
}

const MAX_MODELS = 1_000;

/** Lists the `provider/model` ids of pi's own `models.json`, never pi's built-ins (vito#1130). */
export async function discoverPiModels(options: PiModelDiscoveryOptions = {}): Promise<ModelOption[]> {
  const dir = agentHomePaths(options.env ?? process.env).pi;
  return piModelsFromConfig(JSON.parse(await readFile(join(dir, 'models.json'), 'utf8')));
}

/** The picker entries a parsed `models.json` declares — the pure half, for tests. */
export function piModelsFromConfig(config: unknown): ModelOption[] {
  if (!isRecord(config) || !isRecord(config.providers)) return [];
  const models: ModelOption[] = [];
  const seen = new Set<string>();
  for (const [provider, entry] of Object.entries(config.providers)) {
    if (!provider.trim() || !isRecord(entry) || !Array.isArray(entry.models)) continue;
    for (const model of entry.models) {
      if (models.length >= MAX_MODELS) return models;
      if (!isRecord(model) || typeof model.id !== 'string' || !model.id.trim()) continue;
      const id = `${provider}/${model.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const name = typeof model.name === 'string' && model.name.trim() ? model.name.trim() : model.id;
      models.push({ id, label: name, description: `${id} via ${provider}` });
    }
  }
  return models;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
