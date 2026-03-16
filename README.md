# Shopify Admin API Template

Headless Shopify app for managing store content via the GraphQL Admin API. No frontend, no embedded app — just a CLI tool and batch scripts.

## Installation

Two ways to use this template depending on your needs:

### Option A: Standalone repo

Best for batch scripts, data migrations, or when you don't have a theme repo.

Click **"Use this template"** on GitHub → create a new repository → clone it.

### Option B: Inside a theme repo

Best for content management alongside theme development. The `admin/` folder is invisible to Shopify's GitHub integration.

```bash
cd your-theme-repo

# Recommended: degit downloads without .git history
npx degit PetarPetrov001/admin-app-template admin

# Alternative: clone and remove .git
git clone https://github.com/PetarPetrov001/admin-app-template admin
rm -rf admin/.git
```

Then:
```bash
cd admin
npm install
npm run setup
```

## Quick Start (team members)

If someone has already installed the app and committed `prisma/dev.sqlite`:

```bash
npm install
npm run setup
npm run gql -- ./queries/shop.graphql
```

## First-Time Setup (installer)

### 1. Create and link the app

```bash
shopify app config link
```

When prompted, select **Create a new app** — this creates the app in the Partners dashboard and writes your Client ID into `shopify.app.toml` automatically.

Copy the **Client secret** from the Partners dashboard (App → API access).

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

> **Why commit the database?** The access token belongs to the app installation on the store, not to any individual user. Committing it means every team member can clone and immediately run queries — no one else needs `.env` or the OAuth flow. The repo should be private or team-only.

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
│   ├── lib/               ← Reusable utilities
│   └── examples/          ← Example batch scripts
├── server/                ← Express OAuth server (install only)
├── types/                 ← Codegen output (gitignored)
├── .graphqlrc.ts          ← Codegen configuration
├── shopify.app.toml       ← Shopify app configuration
└── shopify.web.toml       ← Shopify web configuration
```
