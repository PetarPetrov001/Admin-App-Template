import { readFileSync } from 'fs';

import { disconnect, getDefaultShop, listStores } from './shared/shopify-auth.js';
import { adminApi } from './shared/shopify-client.js';

const args = process.argv.slice(2);

// Parse --shop flag
let shopOverride: string | undefined;
const shopFlagIndex = args.indexOf('--shop');
if (shopFlagIndex !== -1) {
  shopOverride = args[shopFlagIndex + 1];
  if (!shopOverride) {
    console.error('--shop requires a value (e.g. --shop my-store.myshopify.com)');
    process.exit(1);
  }
  args.splice(shopFlagIndex, 2);
}

// Parse --stores flag to list all installed stores
if (args.includes('--stores')) {
  try {
    const stores = await listStores();
    if (stores.length === 0) {
      console.log('No stores found. Install the app on a store first.');
    } else {
      console.log('Installed stores:');
      stores.forEach((s) => console.log(`  ${s}`));
    }
  } finally {
    await disconnect();
  }
  process.exit(0);
}

let query = args[0];

if (!query) {
  console.error('Usage:');
  console.error('  npm run gql -- "<graphql query>"');
  console.error('  npm run gql -- ./queries/shop.graphql');
  console.error("  npm run gql -- --shop other-store.myshopify.com '<query>'");
  console.error('  npm run gql -- --stores');
  process.exit(1);
}

// If the query argument looks like a file path, read it
if (query.endsWith('.graphql') || query.endsWith('.gql')) {
  query = readFileSync(query, 'utf-8');
}

let variables: Record<string, unknown> | undefined;
if (args[1]) {
  try {
    variables = JSON.parse(args[1]);
  } catch {
    console.error('Failed to parse variables JSON:', args[1]);
    process.exit(1);
  }
}

try {
  const shop = shopOverride ?? (await getDefaultShop());
  const result = await adminApi(query, variables, shop);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error('Error:', error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await disconnect();
}
