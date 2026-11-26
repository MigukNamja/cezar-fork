import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { modelConflictsWithRunner } from './model-presets.ts';
import { discoverPiModels, piModelsFromConfig } from './pi-model-catalog.ts';

const config = {
  providers: {
    greenpt: { models: [{ id: 'glm-5.3-flash', name: 'GLMv5.3f' }, { id: 'deepseek-v4.1-flash' }] },
    anthropic: { models: [{ id: 'claude-sonnet-5' }, { id: 'claude-sonnet-5' }, { id: '' }, 'junk'] },
    empty: { models: [] },
    broken: 'nope',
  },
};

describe('piModelsFromConfig', () => {
  it('lists exactly the provider/model ids the file declares', () => {
    expect(piModelsFromConfig(config).map((m) => m.id)).toEqual([
      'greenpt/glm-5.3-flash',
      'greenpt/deepseek-v4.1-flash',
      'anthropic/claude-sonnet-5',
    ]);
  });

  it('labels with the model name when there is one', () => {
    expect(piModelsFromConfig(config)[0]).toMatchObject({ label: 'GLMv5.3f' });
    expect(piModelsFromConfig(config)[1]).toMatchObject({ label: 'deepseek-v4.1-flash' });
  });

  it('answers an empty list for empty providers and a provider without models', () => {
    expect(piModelsFromConfig({ providers: {} })).toEqual([]);
    expect(piModelsFromConfig({ providers: { a: {} } })).toEqual([]);
  });

  it('never carries a key or base url into an option', () => {
    const [option] = piModelsFromConfig({ providers: { p: { apiKey: 'SECRET', baseUrl: 'http://x', models: [{ id: 'm' }] } } });
    expect(JSON.stringify(option)).not.toMatch(/SECRET|http:/);
  });

  it('answers an empty list for an unrecognised shape', () => {
    expect(piModelsFromConfig(null)).toEqual([]);
    expect(piModelsFromConfig({ providers: [] })).toEqual([]);
  });
});

describe('discoverPiModels', () => {
  it('reads models.json from the pi agent dir', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pi-models-'));
    try {
      await writeFile(join(dir, 'models.json'), JSON.stringify(config));
      const models = await discoverPiModels({ env: { PI_CODING_AGENT_DIR: dir } });
      expect(models).toHaveLength(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws on a missing or unparseable file so the catalog reports unavailable', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pi-models-'));
    try {
      await expect(discoverPiModels({ env: { PI_CODING_AGENT_DIR: dir } })).rejects.toThrow();
      await writeFile(join(dir, 'models.json'), '{nope');
      await expect(discoverPiModels({ env: { PI_CODING_AGENT_DIR: dir } })).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('pi ids against the cross-runner guard', () => {
  it('a discovered pi id never reads as another runner’s preset, and opencode keeps shared ids', () => {
    for (const model of ['anthropic/claude-sonnet-5', 'greenpt/glm-5.3-flash']) {
      expect(modelConflictsWithRunner(model, 'pi')).toBe(false);
      expect(modelConflictsWithRunner(model, 'opencode')).toBe(false);
    }
  });
});
