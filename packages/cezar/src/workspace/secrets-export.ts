import { promises as fs, constants } from 'node:fs';
import { z } from 'zod';
import { secretEntrySchema, type SecretEntry } from '@open-mercato/cezar-contract';

/**
 * The metadata-only secrets export (fork issue #5). A host writes names, audiences, bindings and
 * timestamps — never ciphertext or a value — and a container without the host keychain reads it to
 * show the Secrets page. `CEZ_SECRETS_EXPORT` names the file; the launcher sets it, so a session
 * in the container cannot turn the mode off by editing a file.
 */
export const SECRETS_EXPORT_ENV = 'CEZ_SECRETS_EXPORT';
const EXPORT_MAX_BYTES = 1024 * 1024;

export const secretsExportSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  workspace: z.array(secretEntrySchema),
  projects: z.record(z.string(), z.array(secretEntrySchema)),
}).strict();
export type SecretsExport = z.infer<typeof secretsExportSchema>;

export function entriesIn(exported: SecretsExport, scope: { kind: 'workspace' } | { kind: 'project'; projectId: string }): SecretEntry[] {
  const entries = scope.kind === 'workspace' ? exported.workspace : (exported.projects[scope.projectId] ?? []);
  return [...entries].sort((a, b) => a.name.localeCompare(b.name));
}

/** A missing or malformed file throws a sentence the page shows; nothing here ever reads a value. */
export async function readSecretsExport(path: string): Promise<SecretsExport> {
  let text: string;
  try {
    const file = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > EXPORT_MAX_BYTES) throw new Error('unusable');
      text = await file.readFile('utf8');
    } finally {
      await file.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('the host has not exported the secrets metadata yet — run `cezar secrets export` on the host');
    }
    throw new Error('the secrets metadata export is unreadable');
  }
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new Error('the secrets metadata export is corrupt — not JSON'); }
  const parsed = secretsExportSchema.safeParse(json);
  if (!parsed.success) throw new Error('the secrets metadata export is corrupt — not a shape this cezar writes');
  return parsed.data;
}
