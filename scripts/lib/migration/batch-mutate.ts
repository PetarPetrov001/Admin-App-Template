import { writeFileSync } from 'fs';

import { disconnect } from '../shopify-auth.js';
import { adminApi } from '../shopify-client.js';
import { isTransientError, sleep } from './helpers.js';
import { buildSuccessSet, loadProgress, saveProgress } from './progress.js';

import type {
  BatchProgressEntry,
  CostExtensions,
  MutationResult,
  ProgressFile,
  ThrottleStatus,
} from './types.js';

/**
 * Standardised shape for Shopify mutation user errors.
 * Matches the convention used by most Admin API mutations:
 * `field: [String!]` (path segments) and `message: String!`.
 */
export interface UserError {
  message: string;
  field?: string[] | null;
}

/**
 * Configuration for {@link batchMutate}.
 *
 * @typeParam TSource - The source item type read from the input JSON.
 * @typeParam TData   - The codegen-generated mutation return type
 *                      (e.g. `ProductSetMutation`).
 */
export interface BatchMutateConfig<TSource, TData> {
  /**
   * The `#graphql` tagged mutation string.
   * Codegen discovers it for type generation, but at runtime the generic
   * `adminApi<TData>()` overload is used so `TData` must be supplied
   * explicitly by the caller.
   */
  mutation: string;

  /**
   * Build the mutation variables object from a source item.
   *
   * @example
   * ```ts
   * buildVariables: (p) => ({ input: buildProductInput(p) })
   * ```
   */
  buildVariables: (item: TSource) => Record<string, unknown>;

  /**
   * Navigate the mutation response to the `userErrors` array.
   * Return an empty array when there are no errors.
   *
   * @example
   * ```ts
   * extractUserErrors: (data) => data.productSet?.userErrors ?? []
   * ```
   */
  extractUserErrors: (data: TData) => UserError[];

  /** Source items to process. */
  items: TSource[];

  /** Human-readable label for the operation (e.g. `"products"`, `"orders"`). */
  label: string;

  /**
   * Extract a short identifier from a source item for log lines.
   *
   * @example
   * ```ts
   * itemLabel: (p) => p.sku
   * ```
   */
  itemLabel: (item: TSource) => string;

  /** Items per concurrent batch. @default 5 */
  concurrency?: number;

  /** Milliseconds between batches when not throttled. @default 500 */
  delayMs?: number;

  /** Max retry attempts per item on throttle/transient errors. @default 3 */
  maxRetries?: number;

  /** Skip first N items (for resuming). @default 0 */
  skip?: number;

  /** When `true`, log the first few items' variables and exit. @default false */
  dryRun?: boolean;

  /** Number of items to preview in dry-run mode. @default 3 */
  dryRunCount?: number;

  /** Path to write failed items as JSON. When omitted, failures are only logged. */
  failedOutputPath?: string;

  /**
   * Path to a JSON progress file for resume-safe operations.
   * When provided, already-succeeded items (matched by {@link itemLabel}) are
   * skipped automatically, and results are saved after every batch.
   */
  progressPath?: string;

  /** Whether to call `disconnect()` in the finally block. @default true */
  autoDisconnect?: boolean;
}

/** Value returned by {@link batchMutate} after all items have been processed. */
export interface BatchMutateResult<TSource> {
  succeeded: number;
  failed: number;
  failedItems: TSource[];
  total: number;
}

// ── Internals ────────────────────────────────────────────────────────

function formatUserErrors(errors: UserError[]): string {
  return errors.map((e) => `${e.field?.join('.') ?? '?'}: ${e.message}`).join('; ');
}

/**
 * Generic runner for Shopify Admin API batch mutations with throttle-aware
 * concurrency, per-item retry, and structured logging.
 *
 * This is the mutation counterpart of {@link paginatedFetch}. It handles:
 * - Configurable concurrency via `Promise.allSettled`
 * - Per-item exponential backoff on throttle / transient errors
 * - Batch-level dynamic backoff when Shopify budget drops below `restoreRate × 2`
 * - Throttle + cost logging per item
 * - DRY_RUN preview mode
 * - Failed-items JSON output for triage
 * - `disconnect()` cleanup
 *
 * @example
 * ```ts
 * await batchMutate<NewProduct, ProductSetMutation>({
 *   mutation,
 *   items: products,
 *   label: 'products',
 *   itemLabel: (p) => p.sku,
 *   buildVariables: (p) => ({ input: buildInput(p) }),
 *   extractUserErrors: (data) => data.productSet?.userErrors ?? [],
 *   concurrency: 5,
 *   dryRun: true,
 *   failedOutputPath: './failed-products.json',
 * });
 * ```
 */
export async function batchMutate<TSource, TData>(
  config: BatchMutateConfig<TSource, TData>,
): Promise<BatchMutateResult<TSource>> {
  const {
    mutation,
    buildVariables,
    extractUserErrors,
    items: allItems,
    label,
    itemLabel,
    concurrency = 5,
    delayMs = 500,
    maxRetries = 3,
    skip = 0,
    dryRun = false,
    dryRunCount = 3,
    failedOutputPath,
    progressPath,
    autoDisconnect = true,
  } = config;

  // ── Progress loading & dedup ─────────────────────────────────────
  const progress: ProgressFile<BatchProgressEntry> | null = progressPath
    ? loadProgress<BatchProgressEntry>(progressPath)
    : null;
  const successSet = progress ? buildSuccessSet(progress, (e) => e.id) : new Set<string>();

  const afterSkip = allItems.slice(skip);
  const skippedDone = afterSkip.filter((item) => successSet.has(itemLabel(item))).length;
  const items = afterSkip.filter((item) => !successSet.has(itemLabel(item)));

  console.log(
    `Loaded ${allItems.length} ${label} (skipping ${skip}, already done ${skippedDone}, to process ${items.length})`,
  );
  console.log(
    `Config: DRY_RUN=${dryRun}, CONCURRENCY=${concurrency}, DELAY_MS=${delayMs}, MAX_RETRIES=${maxRetries}`,
  );
  if (progressPath) {
    console.log(`Progress: ${progressPath} (${successSet.size} succeeded)`);
  }
  console.log();

  const startTime = performance.now();

  // ── Dry-run preview ──────────────────────────────────────────────
  if (dryRun) {
    const preview = items.slice(0, dryRunCount);

    if (preview.length > 0) {
      // Show full variables for the first item
      console.log(`DRY RUN — full payload for first item:\n`);
      console.log(`${itemLabel(preview[0])}:`);
      console.log(JSON.stringify(buildVariables(preview[0]), null, 2));
      console.log();

      // "would send" summary for the rest
      for (let i = 1; i < preview.length; i++) {
        console.log(`[${i + 1}/${items.length}] would send ${itemLabel(preview[i])}`);
      }

      if (items.length > dryRunCount) {
        console.log(`... and ${items.length - dryRunCount} more`);
      }
    }

    console.log();
    console.log(`=== Summary ===`);
    console.log(`Total loaded:    ${allItems.length}`);
    console.log(`Skipped (SKIP):  ${skip}`);
    console.log(`Already done:    ${skippedDone}`);
    console.log(`To process:      ${items.length}`);

    process.exit(0);
  }

  // ── Per-item processor with retry ────────────────────────────────
  async function processOne(item: TSource): Promise<MutationResult<TSource>> {
    const variables = buildVariables(item);
    const id = itemLabel(item);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await adminApi<TData>(mutation, variables);

        const ext = result.extensions as { cost?: CostExtensions } | undefined;
        const throttle: ThrottleStatus | undefined = ext?.cost?.throttleStatus;
        const cost = ext?.cost?.actualQueryCost;

        if (result.errors) {
          const errMsg = result.errors.message ?? 'Unknown GraphQL error';
          const isThrottled = errMsg.toLowerCase().includes('throttl');

          if (isThrottled && attempt < maxRetries) {
            const backoff = Math.min(1000 * Math.pow(2, attempt), 30_000) + Math.random() * 500;
            console.log(
              `  ${id} — throttled, retry ${attempt + 1}/${maxRetries} in ${Math.round(backoff)}ms`,
            );
            await sleep(backoff);
            continue;
          }

          return { node: item, status: 'failed', error: errMsg, throttle, cost };
        }

        const userErrors = extractUserErrors(result.data!);
        if (userErrors.length > 0) {
          return {
            node: item,
            status: 'failed',
            error: formatUserErrors(userErrors),
            throttle,
            cost,
          };
        }

        return { node: item, status: 'success', throttle, cost };
      } catch (err) {
        if (isTransientError(err) && attempt < maxRetries) {
          const backoff = Math.min(1000 * Math.pow(2, attempt), 30_000) + Math.random() * 500;
          console.log(
            `  ${id} — transient error, retry ${attempt + 1}/${maxRetries} in ${Math.round(backoff)}ms: ${err instanceof Error ? err.message : err}`,
          );
          await sleep(backoff);
          continue;
        }
        return {
          node: item,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return { node: item, status: 'failed', error: 'Exhausted retries' };
  }

  // ── Batch execution ──────────────────────────────────────────────
  const failedItems: TSource[] = [];
  let succeeded = 0;

  try {
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const results = await Promise.allSettled(batch.map(processOne));

      let anyThrottled = false;
      let lowestAvailable = Infinity;
      let restoreRate = 50;

      const batchEntries: BatchProgressEntry[] = [];

      for (let k = 0; k < results.length; k++) {
        const settled = results[k];

        if (settled.status === 'rejected') {
          console.error(`  ${itemLabel(batch[k])} — fatal: ${settled.reason}`);
          failedItems.push(batch[k]);
          batchEntries.push({
            id: itemLabel(batch[k]),
            status: 'failed',
            error: String(settled.reason),
            processedAt: new Date().toISOString(),
          });
          continue;
        }

        const r = settled.value;
        const icon = r.status === 'success' ? 'OK' : 'FAIL';
        console.log(
          `[${i + k + 1}/${items.length}] ${icon} ${itemLabel(r.node)}${r.error ? ` — ${r.error}` : ''}`,
        );

        if (r.status === 'success') {
          succeeded++;
        } else {
          failedItems.push(r.node);
        }

        batchEntries.push({
          id: itemLabel(r.node),
          status: r.status,
          ...(r.error && { error: r.error }),
          processedAt: new Date().toISOString(),
        });

        if (r.throttle) {
          const { currentlyAvailable, maximumAvailable, restoreRate: rr } = r.throttle;
          const pct = Math.round((currentlyAvailable / maximumAvailable) * 100);
          console.log(
            `  Throttle: ${currentlyAvailable}/${maximumAvailable} (${pct}%) | restore ${rr}/s | cost ${r.cost ?? '?'}`,
          );

          if (currentlyAvailable < lowestAvailable) {
            lowestAvailable = currentlyAvailable;
            restoreRate = rr;
          }

          if (currentlyAvailable < rr * 2) {
            anyThrottled = true;
          }
        }
      }

      // Save progress after every batch
      if (progress && progressPath) {
        progress.entries.push(...batchEntries);
        saveProgress(progressPath, progress);
      }

      // Dynamic throttle backoff
      if (anyThrottled && lowestAvailable < Infinity) {
        const backoff = Math.ceil(((restoreRate * 2 - lowestAvailable) / restoreRate) * 1000);
        console.log(`  Throttle low (${lowestAvailable} available) — backing off ${backoff}ms`);
        await sleep(backoff);
      } else if (i + concurrency < items.length) {
        await sleep(delayMs);
      }
    }

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    console.log(`\nDone in ${elapsed}s! Succeeded: ${succeeded}, Failed: ${failedItems.length}`);

    if (failedItems.length > 0 && failedOutputPath) {
      writeFileSync(failedOutputPath, JSON.stringify(failedItems, null, 2));
      console.log(`Failed ${label} written to ${failedOutputPath}`);
    }

    return { succeeded, failed: failedItems.length, failedItems, total: items.length };
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return process.exit(1);
  } finally {
    if (autoDisconnect) {
      await disconnect();
    }
  }
}
