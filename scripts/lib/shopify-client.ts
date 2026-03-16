import { createAdminApiClient } from '@shopify/admin-api-client';
import type { AdminApiClient, AdminOperations, ClientResponse } from '@shopify/admin-api-client';

import { getAccessToken, getDefaultShop } from './shopify-auth.js';

export type { AdminApiClient, ClientResponse };

const API_VERSION = '2025-07';

// Cache client instances per shop to avoid re-creating on every call.
const clientCache = new Map<string, AdminApiClient>();

// Get (or create) a configured Admin API client for a shop.
// Shop auto-resolves from the DB when not provided.

export async function getAdminClient(shop?: string): Promise<AdminApiClient> {
  const resolvedShop = shop ?? (await getDefaultShop());
  const cached = clientCache.get(resolvedShop);
  if (cached) return cached;

  const accessToken = await getAccessToken(resolvedShop);
  const client = createAdminApiClient({
    storeDomain: resolvedShop,
    apiVersion: API_VERSION,
    accessToken,
  });

  clientCache.set(resolvedShop, client);
  return client;
}

// Strip index signatures, keeping only explicit (codegen-generated) keys.
type StripIndexSignature<T> = {
  [K in keyof T as string extends K ? never : K]: T[K];
};
type Operations = StripIndexSignature<AdminOperations>;

// When the query string matches a codegen-generated operation key,
// variables and return types are fully inferred.
 
export async function adminApi<Q extends string & keyof Operations>(
  query: Q,
  variables: Operations[Q]['variables'],
  shop?: string,
): Promise<ClientResponse<Operations[Q]['return']>>;
export async function adminApi<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
  shop?: string,
): Promise<ClientResponse<T>>;
export async function adminApi(
  query: string,
  variables?: Record<string, unknown>,
  shop?: string,
): Promise<ClientResponse> {
  const client = await getAdminClient(shop);
  return client.request(query, { variables });
}
