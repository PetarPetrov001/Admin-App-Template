# Shopify Admin API Template

Headless Shopify app for managing store content, running migrations, and large-scale data operations via the GraphQL Admin API. No frontend, no embedded app — just a CLI tool and batch scripts.

> **📖 Full documentation:** [Admin App Template on Notion](https://subsequent-fernleaf-bb9.notion.site/Admin-App-Template-324516a2828b81a4b477f5d974cb76d5)

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
2. `cp .env.example .env` — set `SHOPIFY_APP_URL` to your tunnel URL (leave the other values empty for now)
3. `npm run link-app` — creates the Shopify app and auto-configures the TOML (tunnel URL, `embedded = false`, scopes, redirect URLs)
4. Copy the **Client ID** (from the generated TOML) and **Client secret** (from Partners dashboard → App → API access) into `.env`
5. `shopify app deploy` — registers URLs and scopes with Shopify
6. `npm run dev` — start the Express server
7. In Partners dashboard → Distribution → Custom distribution → generate install link → open it and follow the prompts
8. Commit `prisma/dev.sqlite` — the token is now available to the whole team

> `npm run link-app` runs `shopify app config link` followed by `npm run configure-toml`, which patches the generated TOML with your `.env` values. If `link-app` fails mid-way, you can run the two steps separately: first `shopify app config link`, then `npm run configure-toml`.

## Updating Scopes

Edit the scopes in `shopify.app.toml`, run `shopify app deploy`, then start the server and tunnel (`npm run dev` + ngrok) and open the app from the Shopify admin. The page will show the currently granted scopes and a re-authorize link — click it to complete the OAuth flow and get a fresh token. Commit the updated `prisma/dev.sqlite`.

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
/store-content Create a metaobject definition for team members
```

Claude will validate the query against the Shopify API schema, show you the mutation, and execute it after confirmation.

## Editor Setup

The project includes a `.vscode/` folder with workspace settings (format on save via Prettier) and recommended extensions:

- **Prettier** — code formatting
- **Prisma** — syntax highlighting for `.prisma` files
- **GraphQL Syntax** — syntax highlighting for `#graphql` tagged templates
- **GraphQL** — language features (IntelliSense, validation, go-to-definition) for `.graphql` files
- **Even Better TOML** — syntax highlighting for `.toml` files

VS Code will prompt you to install these when you open the project. Other VS Code-based editors (like Cursor) respect the workspace settings but may not auto-prompt for extensions — install them manually from the list above.

## Trimming the Template

Not using everything? You can safely remove the parts you don't need:

- **Content management only** (just `npm run gql`) — delete `scripts/lib/helpers.ts`, `scripts/lib/paginated-fetch.ts`, `scripts/lib/progress.ts`, `scripts/lib/types.ts`, and `scripts/examples/`. The CLI tool only depends on `scripts/lib/shopify-auth.ts` and `scripts/lib/shopify-client.ts`.
- **Batch scripts only** (no ad-hoc `.graphql` files) — delete the `queries/` folder. The CLI tool can still load `.graphql` files from any path; the folder is just a convenience.

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
