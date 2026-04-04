// Simple HTML response builders for the install flow.
// The server only runs during initial setup, so these are intentionally minimal.

function reAuthLink(shop: string): string {
  return `<a href="/auth?shop=${encodeURIComponent(shop)}">re-authorize the app</a>`;
}

export function pageInstallSuccess(shop: string, scopes: string): string {
  return (
    `<h1>App installed successfully.</h1>` +
    `<p><strong>Store:</strong> ${shop}</p>` +
    `<p><strong>Granted scopes:</strong> ${scopes}</p>` +
    `<p>If a scope is missing, update the TOML, run <code>shopify app deploy</code>, then ${reAuthLink(shop)}.</p>`
  );
}

export function pageAlreadyInstalled(shop: string, scopes: string): string {
  return (
    `<h1>App already installed.</h1>` +
    `<p><strong>Store:</strong> ${shop}</p>` +
    `<p><strong>Granted scopes:</strong> ${scopes}</p>` +
    `<p>If you've deployed updated scopes, ${reAuthLink(shop)} to apply them.</p>`
  );
}

export function pageInstallExpired(): string {
  return (
    `<h1>Install link expired.</h1>` +
    `<p>This authorization link has already been used. Start a new installation from your Partners dashboard.</p>`
  );
}
