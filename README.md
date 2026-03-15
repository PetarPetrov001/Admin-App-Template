# Shopify Admin API Template

Headless Shopify app for managing store content via the GraphQL Admin API. No frontend, no embedded app — just a CLI tool and batch scripts.

## Quick Start (team members)

If someone has already installed the app and committed `prisma/dev.sqlite`:

```bash
npm install
npm run setup
npm run gql -- ./queries/shop.graphql
```

## First-Time Setup (installer)

### 1. Create a custom app in Shopify Partners

1. Go to [partners.shopify.com](https://partners.shopify.com) → Apps → Create app → Create app manually
2. Name it (e.g., "Store Admin CLI")
3. Copy the **Client ID** and **Client secret**

### 2. Configure the app

Update `shopify.app.toml`:
- Replace `REPLACE_WITH_YOUR_CLIENT_ID` with your Client ID
- Update `application_url` and `redirect_urls` with your tunnel URL

Or run:
```bash
shopify app config link
```

### 3. Set up environment

```bash
cp .env.example .env
# Edit .env with your Client ID, Client secret, and tunnel URL
```

### 4. Install dependencies and database

```bash
npm install
npm run setup
```

### 5. Run OAuth flow

Start an ngrok tunnel pointing to localhost:

```bash
ngrok http 3000
```

Update `.env` and `shopify.app.toml` with the ngrok URL, then start the Express server:

```bash
npm run dev
```

Visit `https://<ngrok-url>/auth?shop=YOUR_STORE.myshopify.com` in your browser. Complete the OAuth flow — the server will capture and store the offline access token.

### 6. Commit the database

After successful install, the access token is stored in `prisma/dev.sqlite`:

```bash
git add prisma/dev.sqlite
git commit -m "Add Shopify session token"
```

Now all team members can use the app without needing `.env`.

### 7. Deploy scopes

```bash
shopify app deploy
```

## Usage

### Ad-hoc GraphQL queries

```bash
# Inline query
npm run gql -- 'query { shop { name } }'

# From .graphql file
npm run gql -- ./queries/shop.graphql

# With variables
npm run gql -- ./queries/metafieldDefinitions.graphql '{"ownerType":"PRODUCT"}'

# Target specific store (when multiple installed)
npm run gql -- --shop other-store.myshopify.com 'query { shop { name } }'

# List installed stores
npm run gql -- --stores
```

### Batch scripts

```bash
# Fetch all products (example script)
npx tsx scripts/examples/getAllProducts.ts
```

### Type generation

```bash
# Generate TypeScript types from #graphql tagged queries in scripts/
npm run graphql-codegen
```

## Writing Custom Scripts

See `scripts/examples/getAllProducts.ts` for the pattern. Key utilities:

- **`adminApi(query, variables?, shop?)`** — Execute any GraphQL query/mutation. Shop auto-resolves from DB.
- **`paginatedFetch(config)`** — Cursor-based pagination with optional throttle-aware retry.
- **`helpers.ts`** — `sleep`, `chunk`, `sha256`, `isTransientError`, `resolvePath`
- **`progress.ts`** — Resume-safe progress tracking for batch operations.

## Using with Claude Code

This template includes a slash command for AI-assisted content management:

```
/admin-content Create a metaobject definition for team members
```

Claude will validate the query against the Shopify API schema, show you the mutation, and execute it after confirmation.

## Project Structure

```
├── .claude/commands/      ← Claude Code slash commands
├── prisma/                ← SQLite database + migrations
├── queries/               ← Reusable .graphql files
├── scripts/
│   ├── gql.ts             ← CLI entry point
│   ├── shared/            ← Reusable utilities
│   └── examples/          ← Example batch scripts
├── server/                ← Express OAuth server (install only)
├── types/                 ← Codegen output (gitignored)
├── .graphqlrc.ts          ← Codegen configuration
├── shopify.app.toml       ← Shopify app configuration
└── shopify.web.toml       ← Shopify web configuration
```
