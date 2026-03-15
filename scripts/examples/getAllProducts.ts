/**
 * Example: Fetch all products with their first variant SKU.
 *
 * Demonstrates the paginated-fetch pattern:
 * 1. Define a #graphql query with $first/$after pagination variables
 * 2. Call paginatedFetch with extractConnection + processNodes
 * 3. Results are accumulated and optionally written to a JSON file
 *
 * Usage:
 *   npx tsx scripts/examples/getAllProducts.ts
 */

import { paginatedFetch } from "../shared/paginated-fetch.js";

// The #graphql tag lets codegen discover this query and generate types.
// After running `npm run graphql-codegen`, you can import the generated
// query type and replace `unknown` with the real type for full type safety.
const QUERY = `#graphql
  query getProducts(
    $first: Int!
    $after: String
  ) {
    products(first: $first, after: $after) {
      nodes {
        id
        variants(first: 1) {
          nodes {
            sku
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
` as const;

// After codegen, replace these `any` types with generated types:
//   import type { GetProductsQuery } from "../../types/admin.generated";
//   type Node = GetProductsQuery["products"]["nodes"][number];

await paginatedFetch<any, any, { id: string; variantSkus: string }>({
  query: QUERY,
  label: "products",
  sleepMs: 100,
  outputPath: new URL("./product-variant-skus.json", import.meta.url),
  extractConnection: (data) => data.products,
  processNodes: (nodes) =>
    nodes.map((node: any) => ({
      id: node.id,
      variantSkus: node.variants.nodes.find((v: any) => v.sku)?.sku ?? "",
    })),
});
