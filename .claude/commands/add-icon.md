---
description: Upload SVG icons to the Icons metaobject and optionally reference them in theme code
argument-hint: "<handle> <svg-source> — source can be a URL, file path, or inline SVG markup"
allowed-tools: mcp__shopify-dev-mcp__learn_shopify_api mcp__shopify-dev-mcp__introspect_graphql_schema mcp__shopify-dev-mcp__search_docs_chunks mcp__shopify-dev-mcp__fetch_full_docs mcp__shopify-dev-mcp__validate_graphql_codeblocks mcp__figma__get_design_context mcp__figma__get_screenshot mcp__figma__get_metadata Bash(npm run gql:*) Read Write(queries/*) Edit Glob Grep WebFetch AskUserQuestion
---

You manage SVG icons stored as metaobject entries. Icons are rendered in Liquid via `{% render 'icons-meta', icon: '<handle>' %}`.

**IMPORTANT:** The Shopify Admin API Safety Protocol applies to ALL query/mutation execution in this workflow. You MUST validate, show, confirm via `AskUserQuestion`, then execute. No exceptions.

## User request

$ARGUMENTS

## Workflow

Follow these steps IN ORDER. Do not skip any step.

### Step 0: Preflight checks

Before doing anything else, run these two checks. If either fails, **STOP immediately** — do not proceed to any other step. Inform the user of the specific failure and confirm that no query was executed.

**Admin folder detection:** Check if `scripts/gql.ts` exists in the current directory — if yes, run from here. Otherwise, check if an `admin/` subdirectory exists and run from there.

**1. Verify the store has an access token.** Run `npm run gql -- --stores` from the admin folder. If the output shows "No stores found" or the command fails because the database doesn't exist, tell the user:

> No access token found. The app needs to be installed on a store before you can manage content. Follow the Setup Flow to complete the one-time OAuth install, then try again.

**2. Verify Shopify Dev MCP is connected.** Call `learn_shopify_api` with `api: "custom-data"`. If the tool is unavailable or the call fails, tell the user:

> The `shopify-dev-mcp` MCP server is not connected. This slash command requires it to validate queries against Shopify's live API schema before executing them. Please configure the Shopify Dev MCP server and try again.

### Step 1: Introspect the Icons metaobject definition

**This step is MANDATORY.** Do NOT assume the definition shape — always query it first.

Query the store for the `icons` metaobject definition to discover:
- All field definitions (keys, names, types, required/optional)
- Whether `publishable` capability is enabled
- Storefront access level

```bash
npm run gql -- '{ metaobjectDefinitionByType(type: "icons") { id name type access { storefront } capabilities { publishable { enabled } } fieldDefinitions { key name type { name } required } } }'
```

**If the definition doesn't exist**, stop and tell the user to create it first (via `/store-content` or the Shopify admin).

**Use the discovered fields** to determine:
- Which field holds the SVG content (commonly `svg_content`, but could be named differently)
- Whether there are additional fields that need values (e.g., `display_name`, `title`, `name`, `label`, `alt_text`)
- Which fields are required vs optional

Tell the user about any required fields beyond the SVG content that they need to provide values for.

### Step 2: Parse the input

The user may provide one or more icons. For each icon, determine:

1. **Handle** — lowercase, hyphenated, no special characters. Derive from the filename if not given (e.g., `arrow-right.svg` → `arrow-right`). If ambiguous, ask.
2. **SVG source** — one of:
   - **Figma URL** (contains `figma.com`): see "Extracting SVGs from Figma" below
   - **URL** (starts with `http`): fetch with `WebFetch`
   - **Local file path** (ends with `.svg` or contains path separators): read with `Read`
   - **Inline SVG** (contains `<svg`): use directly
   - **None provided**: ask the user for the SVG source
3. **Additional field values** — if Step 1 discovered extra fields (display name, title, etc.), collect values for them. Use the handle as a sensible default for display-name-type fields if the user doesn't provide one.

#### Extracting SVGs from Figma

When the user provides a Figma URL (`figma.com/design/...`):

1. Parse the URL to extract `fileKey` and `nodeId`:
   - `figma.com/design/:fileKey/:fileName?node-id=:nodeId` → convert `-` to `:` in nodeId
   - `figma.com/design/:fileKey/branch/:branchKey/:fileName` → use branchKey as fileKey
2. Call `get_design_context` with the fileKey and nodeId to retrieve the design data.
3. The response contains code and a screenshot. Look for SVG content in the returned code.
4. **If the node itself is an SVG/vector**: extract the first `<svg>...</svg>` from the code output.
5. **If the node is a frame/group with multiple children**: the user may want a specific icon inside it. Use the screenshot to understand the layout, then ask the user which element they want — or if they said which one, use `get_design_context` with a more specific nodeId if available.
6. **If no SVG is found in the code output**: call `get_screenshot` for the node and inform the user that the Figma node doesn't export as SVG directly — they may need to select the specific vector/icon layer within the frame, or export it from Figma as SVG and provide the file/URL instead.

### Step 3: Clean the SVG

Strip everything except the `<svg>...</svg>` element:
- Remove `<?xml ...?>` declarations
- Remove `<!DOCTYPE ...>` declarations
- Remove HTML/XML comments (`<!-- ... -->`)
- Remove editor metadata (`data-name`, Illustrator `id` patterns like `Layer_1`, Sketch attributes)
- Remove `xmlns:xlink` if no `xlink:href` is used in the SVG
- Keep: `viewBox`, `width`, `height`, `fill`, `stroke`, all SVG presentation attributes, `class`, `aria-hidden`, `focusable`, `role`

### Step 4: Validate against Shopify API

This step is MANDATORY. Do NOT compose queries from memory.

1. Use `introspect_graphql_schema` to verify the `metaobjectUpsert` and `metaobjectUpdate` mutation input types
2. Use `search_docs_chunks` if you need additional context

### Step 5: Compose the GraphQL

**Check existing queries first.** Look in the `queries/` folder for `upsertIcon.graphql` and `publishMetaobject.graphql`. If they exist, use them directly. If not, create them based on the validated schema:

**`queries/upsertIcon.graphql`** — upserts a metaobject entry by handle, returns `id` and field values.

**`queries/publishMetaobject.graphql`** — sets `publishable` status to `ACTIVE` on a metaobject by ID.

Build the variables using the field keys discovered in Step 1:

```json
{
  "handle": { "type": "icons", "handle": "<handle>" },
  "metaobject": {
    "fields": [
      { "key": "<svg_field_key>", "value": "<cleaned-svg>" }
    ]
  }
}
```

Include any additional required fields in the `fields` array.

Escape double quotes inside the SVG value with `\"` in the JSON.

### Step 5b: Show and confirm (Safety Protocol)

Follow the Shopify Admin API Safety Protocol (`.claude/rules/shopify-content-guard.md`) exactly. Display the full query and variables, then confirm via `AskUserQuestion`. Do not proceed until "Run it" is selected.

When presenting multiple icons, show all mutations together in one confirmation prompt.

### Step 6: Execute

Run the upsert, then **always publish immediately after**.

**Upsert:**
```bash
npm run gql -- ./queries/upsertIcon.graphql '<variables_json>'
```

Check `userErrors` — if non-empty, report and stop.

**Publish:** If the definition has `publishable` enabled (discovered in Step 1), extract the `id` from the upsert response and publish immediately. New entries default to DRAFT and are **invisible on the storefront** until published.

```bash
npm run gql -- ./queries/publishMetaobject.graphql '{"id":"<metaobject_id>"}'
```

Check `userErrors` — if non-empty, report and stop.

Publishing does NOT require a separate confirmation — it is part of the same approved operation.

### Step 7: Reference in code (if requested)

If the user specified where to reference the icon:

- **In Liquid files**: replace inline SVG or add `{%- render 'icons-meta', icon: '<handle>' -%}`
- **In JS files**: add a `<template data-icon-<name>>` element in the parent Liquid file with the `icons-meta` render, then update JS to read `this.querySelector('template[data-icon-<name>]')?.innerHTML`
- **CSS `background-image` data URIs**: cannot use `icons-meta` — inform the user

### Step 8: Report results

After execution:
1. Check for `userErrors` in the response — these indicate validation failures from Shopify
2. Check for top-level `errors` — these indicate GraphQL syntax or permission issues
3. Report the outcome clearly to the user
4. If there were errors, explain what went wrong and suggest a fix

For each successfully created icon, show:

| Handle | Status | Usage |
|--------|--------|-------|
| `<handle>` | Created & Published | `{% render 'icons-meta', icon: '<handle>' %}` |

If SVG uses `currentColor`, note it inherits the parent's text color. If it uses hardcoded colors, note the specific colors.

## Shell caveats

- **Never use inline queries with `!`** — bash escapes them. Always use `.graphql` files for mutations.
- **Escape `"` inside JSON values** — SVG attributes contain double quotes that must be escaped as `\"`.

## Token / session errors

If execution fails with token errors (`No stores found`, `No offline session found`, or `401 Unauthorized`), tell the user:
- The access token is missing or invalid — the app needs to be installed (or reinstalled) on the store
- They should follow the Setup Flow to complete the OAuth install (HTTPS tunnel + Express server + auth URL)
- Once installed, the token is stored in `prisma/dev.sqlite` and `npm run gql` will work without any extra configuration
