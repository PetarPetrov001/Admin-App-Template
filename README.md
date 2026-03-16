# Shopify Admin API Template

Headless Shopify app for managing store content via the GraphQL Admin API. No frontend, no embedded app — just a CLI tool and batch scripts.

> **📖 Full documentation:** [Admin App Template on Notion](https://www.notion.so/324516a2828b81a4b477f5d974cb76d5)

## Installation

Two ways to use this template depending on your needs:

**Standalone repo** — Best for batch scripts and data migrations. Click **"Use this template"** on GitHub → create a new repository → clone it.

**Inside a theme repo** — Best for content management alongside theme development. The `admin/` folder is invisible to Shopify's GitHub integration.

```bash
cd your-theme-repo
npx degit PetarPetrov001/admin-app-template admin
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

Only one person per project needs to run this flow. Once complete, the access token is committed to git and everyone else just runs `npm install && npm run setup`.

**Prerequisites:** Node.js 20+, Shopify CLI, a Shopify Partners account, and an HTTPS tunneling tool (ngrok, Cloudflare Tunnel, etc.)

See the [Setup Flow](https://www.notion.so/324516a2828b8137bedfdea7fc4f1d1e) in the docs for the full step-by-step guide. The short version:

1. Start your HTTPS tunnel (ngrok, Cloudflare Tunnel, etc.)
2. `shopify app config link` — create a new app (let it generate a new toml; `shopify.app.example.toml` is kept as reference)
3. Configure the new toml using the example — set tunnel URL, `embedded = false`, scopes
4. Set up `.env` with your Client ID, Client secret, and tunnel URL
5. `shopify app deploy` — registers URLs and scopes with Shopify
6. `npm run dev` — start the Express server
7. In Partners dashboard → Distribution → Custom distribution → generate install link → open it and follow the prompts
8. Commit `prisma/dev.sqlite` — the token is now available to the whole team

## Usage

### Ad-hoc GraphQL queries

```bash
# Inline query
npm run gql -- 'query { shop { name } }'

# From .graphql file
npm run gql -- ./queries/shop.graphql

# With variables
npm run gql -- ./queries/metafieldDefinitions.graphql '{"ownerType":"PRODUCT"}'

# List installed stores
npm run gql -- --stores

# Target specific store (custom apps typically have one store,
# but you might also install on a dev store for testing)
npm run gql -- --shop other-store.myshopify.com 'query { shop { name } }'
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

- **`adminApi(query, variables?, shop?)`** — Execute any GraphQL query/mutation via `@shopify/admin-api-client`. Shop auto-resolves from DB.
- **`paginatedFetch(config)`** — Cursor-based pagination with optional throttle-aware retry.
- **`helpers.ts`** — `sleep`, `chunk`, `sha256`, `isTransientError`, `resolvePath`
- **`progress.ts`** — Resume-safe progress tracking for batch operations.

## Using with Claude Code

This template includes a slash command for AI-assisted content management:

```
/admin-content Create a metaobject definition for team members
```

Claude will validate the query against the Shopify API schema, show you the mutation, and execute it after confirmation.

## Editor Setup

The project includes a `.vscode/` folder with workspace settings (format on save via Prettier) and recommended extensions:

- **Prettier** — code formatting
- **Prisma** — syntax highlighting for `.prisma` files
- **GraphQL Syntax** — syntax highlighting for `#graphql` tagged templates
- **Even Better TOML** — syntax highlighting for `.toml` files

VS Code will prompt you to install these when you open the project. Other VS Code-based editors (like Cursor) respect the workspace settings but may not auto-prompt for extensions — install them manually from the list above.

## Project Structure

```
├── .claude/commands/      ← Claude Code slash commands
├── .vscode/               ← Editor settings + recommended extensions
├── prisma/                ← SQLite database + migrations
├── queries/               ← Reusable .graphql files
├── scripts/
│   ├── gql.ts             ← CLI entry point
│   ├── lib/               ← Reusable utilities
│   └── examples/          ← Example batch scripts
├── server/                ← Express OAuth server (install only)
├── types/                 ← Codegen output (gitignored)
├── .graphqlrc.ts          ← Codegen configuration
├── shopify.app.example.toml ← Reference for app configuration
└── shopify.web.toml       ← Shopify web configuration
```
