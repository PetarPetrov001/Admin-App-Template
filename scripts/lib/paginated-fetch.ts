import { writeFileSync } from 'fs';

import { isTransientError, sleep } from './helpers.js';
import { disconnect } from './shopify-auth.js';
import { adminApi } from './shopify-client.js';

import type { ClientResponse } from './shopify-client.js';

interface Connection<N> {
  nodes: N[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor?: string | null;
  };
}

/**
 * Configuration for {@link paginatedFetch}.
 *
 * @typeParam TData   - The codegen-generated query return type (e.g. `GetProductsQuery`).
 * @typeParam TNode   - The node type from the connection
 *                      (e.g. `GetProductsQuery["products"]["nodes"][number]`).
 * @typeParam TResult - The output item type after processing
 *                      (e.g. `{ id: string; variantSkus: string }`).
 */
export interface PaginatedFetchConfig<TData, TNode, TResult> {
  /**
   * The GraphQL query string. Must use `#graphql` tagged template literal
   * so that codegen can discover it and generate types.
   *
   * The query **must** declare `$first: Int!` and `$after: String` variables
   * (these are injected automatically by the runner).
   */
  query: string;

  /**
   * Additional query variables beyond `first` and `after`.
   *
   * @example
   * ```ts
   * variables: { resourceType: "PRODUCT" }
   * ```
   */
  variables?: Record<string, unknown>;

  /**
   * Extract the paginated connection from the query response data.
   * Must return the object containing `nodes` and `pageInfo`.
   *
   * @example
   * ```ts
   * extractConnection: (data) => data.products
   * extractConnection: (data) => data.translatableResources
   * ```
   */
  extractConnection: (data: TData) => Connection<TNode>;

  /**
   * Transform a page of raw nodes into result items to accumulate.
   * Return an empty array to skip all nodes on this page.
   *
   * Common patterns:
   * - **Pass-through:** `(nodes) => nodes`
   * - **Map:** `(nodes) => nodes.map(n => ({ id: n.id, sku: n.sku }))`
   * - **Filter:** `(nodes) => nodes.filter(n => regex.test(n.email))`
   * - **Filter + Map:** `(nodes) => nodes.flatMap(n => { ... })`
   */
  processNodes: (nodes: TNode[]) => TResult[];

  /** Human-readable label used in console log messages (e.g. `"products"`, `"tab panels"`). */
  label: string;

  /** Number of items per page. @default 250 */
  pageSize?: number;

  /** Milliseconds to sleep between pages. @default 100 */
  sleepMs?: number;

  /**
   * Output file URL. When provided, the accumulated results are written as
   * pretty-printed JSON after all pages are fetched.
   *
   * @example
   * ```ts
   * outputPath: new URL("./product-variant-skus.json", import.meta.url)
   * ```
   */
  outputPath?: URL;

  /**
   * Enable throttle-aware retry mode. When `true`, each page request is
   * wrapped with exponential backoff (1 s to 30 s + jitter) on throttle
   * and transient errors, and the Shopify throttle budget
   * (`extensions.cost.throttleStatus.currentlyAvailable`) is monitored.
   *
   * When `false` (default), GraphQL errors cause an immediate `process.exit(1)`.
   *
   * @default false
   */
  throttleAware?: boolean;

  /** Max retry attempts per page when {@link throttleAware} is `true`. @default 6 */
  maxRetries?: number;

  /**
   * Throttle budget threshold. An extra 1 s sleep is inserted when the
   * Shopify-reported `currentlyAvailable` cost drops below this value.
   * @default 100
   */
  throttleBudgetThreshold?: number;

  /**
   * Whether to call `disconnect()` in the finally block. Set to `false`
   * when using `paginatedFetch` as an inner loop (e.g. batched fetching)
   * where the caller manages the connection lifecycle.
   *
   * @default true
   */
  autoDisconnect?: boolean;
}

/** Value returned by {@link paginatedFetch} after all pages have been consumed. */
export interface PaginatedFetchResult<TResult> {
  /** Accumulated result items from every page (output of {@link PaginatedFetchConfig.processNodes}). */
  results: TResult[];
  /** Total number of raw nodes fetched across all pages (before processing). */
  totalFetched: number;
  /** Number of pages that were fetched. */
  pages: number;
}

// ── Private: throttle-aware page fetch with retry ─────────────────────
async function fetchPageWithRetry<TData>(
  query: string,
  variables: Record<string, unknown>,
  page: number,
  maxRetries: number,
  throttleBudgetThreshold: number,
): Promise<{ data: TData; throttled: boolean }> {
  const prefix = `Page ${page}`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result: ClientResponse<TData> = await adminApi(query, variables);

      if (result.errors) {
        const errMsg = result.errors.message ?? 'Unknown GraphQL error';
        const isThrottled = errMsg.toLowerCase().includes('throttl');

        if (isThrottled && attempt < maxRetries) {
          const backoff = Math.min(1000 * Math.pow(2, attempt), 30000) + Math.random() * 500;
          console.log(
            `${prefix} — throttled, retrying in ${Math.round(backoff)}ms (attempt ${attempt + 1}/${maxRetries})`,
          );
          await sleep(backoff);
          continue;
        }

        throw new Error(`GraphQL errors on ${prefix}: ${errMsg}`);
      }

      const ext = result.extensions as
        | { cost?: { throttleStatus?: { currentlyAvailable?: number } } }
        | undefined;
      const available = ext?.cost?.throttleStatus?.currentlyAvailable;
      let throttled = false;

      if (available !== undefined && available < throttleBudgetThreshold) {
        console.log(`${prefix} — throttle budget low (${available}), sleeping extra 1s`);
        throttled = true;
        await sleep(1000);
      }

      return { data: result.data!, throttled };
    } catch (error) {
      if (isTransientError(error) && attempt < maxRetries) {
        const backoff = Math.min(1000 * Math.pow(2, attempt), 30000) + Math.random() * 500;
        console.log(
          `${prefix} — transient error, retrying in ${Math.round(backoff)}ms (attempt ${attempt + 1}/${maxRetries})`,
        );
        await sleep(backoff);
        continue;
      }
      throw error;
    }
  }

  throw new Error(`${prefix} — exhausted all ${maxRetries} retries`);
}

/**
 * Generic runner for Shopify Admin API paginated (cursor-based) queries.
 *
 * Handles the pagination loop, error handling, sleep between pages,
 * optional JSON file output, and `disconnect()` cleanup — so callers
 * only need to provide the query, how to extract/process nodes, and config.
 *
 * **Simple mode** (default): exits on GraphQL errors via `process.exit(1)`.
 * **Throttle-aware mode** (`throttleAware: true`): retries with exponential
 * backoff on throttle/transient errors, monitors Shopify cost budget.
 *
 * @example Simple fetch — all products
 * ```ts
 * await paginatedFetch<GetProductsQuery, Node, { id: string }>({
 *   query: QUERY,
 *   label: "products",
 *   outputPath: new URL("./products.json", import.meta.url),
 *   extractConnection: (data) => data.products,
 *   processNodes: (nodes) => nodes.map((n) => ({ id: n.id })),
 * });
 * ```
 *
 * @example Throttle-aware fetch
 * ```ts
 * await paginatedFetch<GetCustomersQuery, Node, Node>({
 *   query: QUERY,
 *   label: "customers",
 *   throttleAware: true,
 *   outputPath: new URL("./customers.json", import.meta.url),
 *   extractConnection: (data) => data.customers,
 *   processNodes: (nodes) => nodes.filter(filterFn),
 * });
 * ```
 *
 * @example Inner loop (batched fetching) — caller manages disconnect
 * ```ts
 * const { results } = await paginatedFetch({
 *   query: QUERY,
 *   variables: { resourceIds: batch },
 *   label: `batch ${i}/${total}`,
 *   autoDisconnect: false,
 *   extractConnection: (data) => data.translatableResourcesByIds,
 *   processNodes: (nodes) => nodes,
 * });
 * ```
 */
export async function paginatedFetch<TData, TNode, TResult>(
  config: PaginatedFetchConfig<TData, TNode, TResult>,
): Promise<PaginatedFetchResult<TResult>> {
  const {
    query,
    variables = {},
    extractConnection,
    processNodes,
    label,
    pageSize = 250,
    sleepMs = 100,
    outputPath,
    throttleAware = false,
    maxRetries = 6,
    throttleBudgetThreshold = 100,
    autoDisconnect = true,
  } = config;

  console.log(`Fetching all ${label}...`);

  const allResults: TResult[] = [];
  let after: string | null = null;
  let page = 0;
  let totalFetched = 0;

  try {
    do {
      page++;

      let data: TData;
      let wasThrottled = false;

      if (throttleAware) {
        const fetched = await fetchPageWithRetry<TData>(
          query,
          { ...variables, first: pageSize, after },
          page,
          maxRetries,
          throttleBudgetThreshold,
        );
        data = fetched.data;
        wasThrottled = fetched.throttled;
      } else {
        const result: ClientResponse<TData> = await adminApi(query, {
          ...variables,
          first: pageSize,
          after,
        });

        if (result.errors) {
          console.error('GraphQL errors:', result.errors.graphQLErrors ?? result.errors.message);
          process.exit(1);
        }

        data = result.data!;
      }

      const { nodes, pageInfo } = extractConnection(data);
      totalFetched += nodes.length;

      const processed = processNodes(nodes);
      allResults.push(...processed);

      console.log(
        `Page ${page}: fetched ${nodes.length} ${label} (${allResults.length} results from ${totalFetched} total)`,
      );

      after = pageInfo.hasNextPage ? (pageInfo.endCursor ?? null) : null;

      if (after) {
        await sleep(wasThrottled ? 2000 : sleepMs);
      }
    } while (after);

    if (outputPath) {
      writeFileSync(outputPath, JSON.stringify(allResults, null, 2));
      console.log(`Done! Wrote ${allResults.length} results to ${outputPath.pathname}`);
    }

    return { results: allResults, totalFetched, pages: page };
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return process.exit(1);
  } finally {
    if (autoDisconnect) {
      await disconnect();
    }
  }
}
