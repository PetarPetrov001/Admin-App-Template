import type { AdminQueries, AdminMutations } from "@shopify/admin-api-client";
import { getAccessToken, getDefaultShop } from "./shopify-auth.js";

const API_VERSION = "2025-07";

export interface ThrottleStatus {
  maximumAvailable: number;
  currentlyAvailable: number;
  restoreRate: number;
}

export interface QueryCost {
  requestedQueryCost: number;
  actualQueryCost: number;
  throttleStatus: ThrottleStatus;
}

export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string; locations?: unknown; path?: unknown }>;
  extensions?: { cost?: QueryCost };
}

// Strip index signatures, keeping only explicit (codegen-generated) keys.
type StripIndexSignature<T> = {
  [K in keyof T as string extends K ? never : K]: T[K];
};
type Operations = StripIndexSignature<AdminQueries & AdminMutations>;

// Typed overloads — when codegen types are available, the first overload
// provides full type safety for query variables and return types.
export async function adminApi<Q extends string & keyof Operations>(
  query: Q,
  variables: Operations[Q]["variables"],
  shop?: string,
): Promise<GraphQLResponse<Operations[Q]["return"]>>;
export async function adminApi<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
  shop?: string,
): Promise<GraphQLResponse<T>>;
export async function adminApi(
  query: string,
  variables?: Record<string, unknown>,
  shop?: string,
): Promise<GraphQLResponse> {
  const resolvedShop = shop ?? (await getDefaultShop());
  const accessToken = await getAccessToken(resolvedShop);

  const response = await fetch(
    `https://${resolvedShop}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );

  if (response.status === 401) {
    throw new Error(
      `Access token for ${resolvedShop} is invalid or expired. ` +
        `Reinstall the app: start ngrok + Express server → complete OAuth flow.`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `GraphQL request failed (${response.status}): ${await response.text()}`,
    );
  }

  return response.json() as Promise<GraphQLResponse>;
}
