import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname } from "path";
import type { ProgressFile } from "./types.js";

export function progressKey(
  resourceId: string,
  locale: string,
  key: string,
  digest: string,
  valueHash: string,
): string {
  return `${resourceId}|${locale}|${key}|${digest}|${valueHash}`;
}

export function loadProgress(path: string): ProgressFile {
  if (existsSync(path)) {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as ProgressFile;
  }
  return { version: 1, entries: [] };
}

export function saveProgress(path: string, progress: ProgressFile): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(progress, null, 2));
}

export function buildSuccessSet(progress: ProgressFile): Set<string> {
  const set = new Set<string>();
  for (const entry of progress.entries) {
    if (entry.status === "success") {
      set.add(
        progressKey(
          entry.resourceId,
          entry.locale,
          entry.key,
          entry.digest,
          entry.valueHash,
        ),
      );
    }
  }
  return set;
}
