# CLAUDE.md

## Project Overview

Headless Shopify app — CLI tool + batch scripts for managing store content via the GraphQL Admin API.

1. One-time OAuth install captures an offline access token
2. Token is stored in SQLite via Prisma (committed to git after install)
3. `npm run gql` executes any Admin API query/mutation using the stored token
4. Scripts in `scripts/` handle batch operations (paginated fetches, bulk mutations, etc.)

No frontend UI. No embedded app. No App Bridge.

### How it fits in a theme repo

This app is designed to live inside theme repos as the `admin/` folder:

```
theme-repo/                ← git repo, connected to Shopify GitHub integration
  assets/                  ← theme files (synced by Shopify)
  sections/
  templates/
  ...
  admin/                   ← this app (ignored by Shopify — not a theme folder)
    scripts/
    server/
    prisma/dev.sqlite      ← committed, contains access token
    .env                   ← gitignored, only needed for initial install
```

Shopify's GitHub integration ignores folders that don't match the theme structure, so `admin/` is invisible to it.

### Setup for team members

- **Installer (once):** needs `.env` with API credentials, runs `npm run link-app` to create and configure the Shopify app, starts ngrok + Express server, visits auth URL to complete OAuth
- **Everyone else:** clone, `cd admin && npm install && npm run setup` — done. Token is already in the DB.

## Commands

Run from the app directory:

| Task | Command |
|------|---------|
| Ad-hoc GraphQL | `npm run gql -- '<query>'` |
| GraphQL from file | `npm run gql -- ./queries/shop.graphql` |
| With variables | `npm run gql -- '<query>' '{"key":"value"}'` |
| List installed stores | `npm run gql -- --stores` |
| Target specific store | `npm run gql -- --shop other.myshopify.com '<query>'` |
| DB setup | `npm run setup` |
| Generate API types | `npm run graphql-codegen` |

Shop is auto-detected from the database. Custom apps are typically installed on a single store, but you might also install on a dev store for testing. If multiple stores exist, `--shop` is required.

### Install-only commands (need `.env`)

| Task | Command |
|------|---------|
| Link + configure app (one step) | `npm run link-app` — runs `shopify app config link` then auto-configures the TOML |
| Configure TOML only | `npm run configure-toml` — patches an existing TOML with `.env` values |
| Start HTTPS tunnel | `ngrok http 3000` (or any tunneling tool) |
| Start Express server | `npm run dev` |
| Deploy config to Shopify | `shopify app deploy` |

## Architecture

### Scripts (`scripts/`)

CLI tools for Admin API access. No `.env` needed — shop and token come from the DB.
- `gql.ts` — ad-hoc GraphQL queries (inline or from .graphql files)
- `lib/shopify-auth.ts` — session lookup via Prisma, auto-detects shop from DB
- `lib/shopify-client.ts` — typed GraphQL client via `@shopify/admin-api-client` with codegen-compatible overloads
- `lib/paginated-fetch.ts` — generic cursor-based pagination runner with throttle-aware retry
- `lib/helpers.ts` — utility functions (sleep, chunk, sha256, isTransientError, resolvePath)
- `lib/progress.ts` — digest-based dedup for resume-safe batch operations
- `lib/types.ts` — shared TypeScript interfaces (ProgressEntry, ProgressFile)
- `examples/getAllProducts.ts` — demonstrates the paginated-fetch pattern

### Server (`server/index.ts`)

Express + @shopify/shopify-api. Only runs during the one-time OAuth install. Handles the install flow (begin + callback). Includes an APP_UNINSTALLED webhook handler as a safety net, but since the server doesn't run persistently, webhooks won't fire in practice.

### Prisma

SQLite session storage at `prisma/dev.sqlite`. Committed to git so all team members have access to the stored token.

### Codegen (`types/`)

`npm run graphql-codegen` scans `scripts/` for `#graphql` tagged queries and generates TypeScript types into `types/admin.generated.*`. Use these types with the `adminApi()` typed overloads for full type safety.

## Token Type

Uses traditional non-expiring offline access tokens. No refresh logic needed.
Tokens persist until the app is uninstalled, the API secret is revoked, or the store is closed.
Scope changes via `shopify app deploy` update the app config on Shopify's side, but the existing token keeps its old scopes. To pick up new scopes, start the server and tunnel, open the app from the Shopify admin, and click the re-authorize link on the page that appears. This completes a fresh OAuth flow and replaces the token. Commit the updated `prisma/dev.sqlite` so the rest of the team gets it.

## Key Patterns

- Session ID format: `offline_{shop}` (e.g., `offline_mystore.myshopify.com`)
- GraphQL endpoint: `https://{shop}/admin/api/2025-07/graphql.json`
- Access token header: `X-Shopify-Access-Token`
- Always call `disconnect()` in finally blocks for CLI scripts

## Content Management Workflow

This app is primarily used to manage Shopify store content via the GraphQL Admin API.
Common tasks include creating/updating metafields, metaobject definitions, reading resource data, etc.

### Safety Protocol

All Admin API query/mutation execution is governed by the **Shopify Admin API Safety Protocol** in `.claude/rules/shopify-content-guard.md`. This rule is always active — it applies regardless of whether `/store-content` was invoked or content work is part of a larger task (e.g., building frontend components alongside content updates).

The protocol requires: schema validation via `shopify-dev-mcp` tools → full query display → explicit user confirmation via `AskUserQuestion` → execution via `npm run gql` only → error checking. See the rule file for the full specification.

### Common Task Patterns

- **Create metafield definition** — Use `metafieldDefinitionCreate` mutation. Requires: `name`, `namespace`, `key`, `type`, `ownerType`.
- **Set metafield values** — Use `metafieldsSet` mutation with `metafields` input array.
- **Read metafields** — Query the resource (e.g. `products`, `collections`) with `metafields(first: N)` or by `namespace` and `key`.
- **Create metaobject definition** — Use `metaobjectDefinitionCreate` mutation. Requires: `name`, `type`, `fieldDefinitions`.
- **Create/update metaobject entries** — Use `metaobjectCreate` / `metaobjectUpdate` mutations.
- **Read metaobjects** — Use `metaobjects(type: "...")` query.

Always introspect the schema for the exact input shape — Shopify's API evolves across versions.

## Script Development Workflow

When writing new batch scripts:

1. **Codegen first** — Add `#graphql` tagged queries in your script, run `npm run graphql-codegen`, then import the generated types
2. **Use `paginatedFetch`** — For any "fetch all X" operation, use the pagination runner from `lib/paginated-fetch.ts`
3. **Use `adminApi()`** — For mutations or single queries. Shop auto-resolves from DB when not provided
4. **Progress tracking** — For long-running batch operations, use `lib/progress.ts` to track what's been processed and enable safe resume
5. **Throttle awareness** — Set `throttleAware: true` in paginated-fetch config for large datasets that may hit rate limits
6. **Always disconnect** — Use `disconnect()` in finally blocks, or `autoDisconnect: true` (default) in paginated-fetch
