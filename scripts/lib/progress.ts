import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import type { ProgressEntryBase, ProgressFile } from './types.js';

/**
 * Load a progress file from disk, or return an empty one if it doesn't exist.
 * The entry type `E` is inferred from the caller's usage.
 */
export function loadProgress<E extends ProgressEntryBase>(path: string): ProgressFile<E> {
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, 'utf-8')) as ProgressFile<E>;
  }
  return { version: 1, entries: [] };
}

/** Persist a progress file to disk (creates parent directories if needed). */
export function saveProgress<E extends ProgressEntryBase>(
  path: string,
  progress: ProgressFile<E>,
): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(progress, null, 2));
}

/**
 * Build a `Set` of keys for all successfully processed entries.
 * The caller provides `keyFn` to extract a dedup key from each entry.
 *
 * @example Batch mutations (single ID)
 * ```ts
 * buildSuccessSet(progress, (e) => e.id)
 * ```
 *
 * @example Translations (composite key)
 * ```ts
 * buildSuccessSet(progress, (e) => progressKey(e.resourceId, e.locale, e.key, e.digest, e.valueHash))
 * ```
 */
export function buildSuccessSet<E extends ProgressEntryBase>(
  progress: ProgressFile<E>,
  keyFn: (entry: E) => string,
): Set<string> {
  const set = new Set<string>();
  for (const entry of progress.entries) {
    if (entry.status === 'success') {
      set.add(keyFn(entry));
    }
  }
  return set;
}

/**
 * Build a composite progress key for translation workflows.
 * Kept as a convenience — callers pass this to {@link buildSuccessSet}.
 */
export function progressKey(
  resourceId: string,
  locale: string,
  key: string,
  digest: string,
  valueHash: string,
): string {
  return `${resourceId}|${locale}|${key}|${digest}|${valueHash}`;
}
