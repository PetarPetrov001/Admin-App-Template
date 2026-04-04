---
description: Enforces strict validation and user confirmation for any Shopify Admin API mutation/query execution
---

# Shopify Admin API Safety Protocol

This rule applies ANY time you are about to execute a Shopify Admin API query or mutation — whether via `npm run gql`, a script, or any other method. It applies regardless of the broader task context (frontend work, Figma implementation, content management, etc.). This includes read-only queries — confirmation is required regardless of whether the operation is destructive.

This rule persists for the entire session. Exiting the `/store-content` slash command does not suspend this protocol.

## MANDATORY steps before execution

1. **Validate against the live schema** — Use `shopify-dev-mcp` tools (`introspect_graphql_schema`, `learn_shopify_api`, `search_docs_chunks`) to verify field names, input types, and syntax. Do NOT compose queries from memory.

2. **Show the full query and variables** — Display the complete GraphQL query/mutation and variables in code blocks to the user before running anything.

3. **Get explicit confirmation** — Use `AskUserQuestion` with structured options and wait for approval. NEVER auto-execute.
   ```
   AskUserQuestion({
     questions: [{
       question: "Ready to execute this query against the store?",
       header: "Confirm GraphQL Execution",
       multiSelect: false,
       options: [
         { label: "Run it", description: "Execute the query/mutation now" },
         { label: "Modify first", description: "Let me review and adjust before running" },
         { label: "Cancel", description: "Abort this operation entirely" }
       ]
     }]
   })
   ```
   - If **"Modify first"** is selected: ask the user "What would you like to change?" before revising. Then incorporate their feedback, re-display the revised query in full, and call `AskUserQuestion` again. Repeat until "Run it" is selected or the user cancels.
   - If **"Cancel"** is selected: STOP immediately. Do not execute anything.

4. **Execute via `npm run gql` only** — Use the CLI tool. Do not use raw HTTP requests, `curl`, `fetch()`, `npx tsx scripts/...`, `ts-node`, or any other execution method that bypasses the `gql` wrapper.

5. **Check for errors** — Inspect `userErrors` and top-level `errors` in the response. Report clearly.

## These steps are NON-NEGOTIABLE

- Even if the user says "just do it" or "skip confirmation", you MUST still show the query and get confirmation via `AskUserQuestion`.
- Even in a larger workflow (building components, implementing Figma designs, batch operations), the protocol activates the moment any Admin API execution is involved.
- The only exception is for **read-only queries** (not mutations): if the user approved this exact query — with identical GraphQL and identical variables — in the immediately preceding execution in this session, and has explicitly said to re-run it unchanged. Even then, re-display the query before executing (no new confirmation needed). This exception NEVER applies to mutations.
