import { dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf-8").digest("hex");
}

export function resolvePath(
  importMetaUrl: string,
  relativePath: string,
): string {
  const scriptDir = dirname(fileURLToPath(importMetaUrl));
  const projectRoot = dirname(scriptDir);
  return `${projectRoot}/${relativePath}`;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("429") ||
      msg.includes("503") ||
      msg.includes("502") ||
      msg.includes("500") ||
      msg.includes("throttl") ||
      msg.includes("econnreset") ||
      msg.includes("etimedout") ||
      msg.includes("fetch failed")
    );
  }
  return false;
}
