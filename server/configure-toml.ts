import { readdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';

// Utils

const ANSI = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
} as const;

function clr(str: string, ...styles: (keyof typeof ANSI)[]): string {
  return styles.map((s) => ANSI[s]).join('') + str + ANSI.reset;
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Helpers

function findTomlFile(root: string): string {
  const tomlFiles = readdirSync(root).filter(
    (f) =>
      (f === 'shopify.app.toml' || (f.startsWith('shopify.app.') && f.endsWith('.toml'))) &&
      f !== 'shopify.app.example.toml',
  );

  if (tomlFiles.length === 0) {
    console.error(
      clr('Error:', 'red', 'bold'),
      'No generated toml found. Run `shopify app config link` first.',
    );
    process.exit(1);
  }
  if (tomlFiles.length > 1) {
    console.error(
      clr('Error:', 'red', 'bold'),
      `Multiple toml files found: ${tomlFiles.join(', ')}. Keep only the one you want to configure.`,
    );
    process.exit(1);
  }

  return tomlFiles[0];
}

function getEnvTunnelUrl(): string {
  const tunnelUrl = process.env.SHOPIFY_APP_URL?.trim();

  if (!tunnelUrl || tunnelUrl === 'https://your-tunnel-url.ngrok-free.dev') {
    console.error(
      clr('Error:', 'red', 'bold'),
      'SHOPIFY_APP_URL is missing or still set to the placeholder.\n' +
        '   Copy .env.example to .env and set it to your tunnel URL.',
    );
    process.exit(1);
  }

  return tunnelUrl;
}

async function resolveAppName(
  root: string,
  tomlFilename: string,
): Promise<{ appName: string; tomlFilename: string }> {
  const tomlPath = join(root, tomlFilename);
  const currentName = readFileSync(tomlPath, 'utf-8').match(/^name\s*=\s*"(.+)"/m)?.[1] ?? '';
  const defaultName = currentName || 'Admin App';

  console.log(clr('  This is the user-facing name shown when the app is installed on a store.', 'dim'));
  const appName = (await prompt(`App name [${defaultName}]: `)) || defaultName;

  const slug = appName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const newTomlFilename = `shopify.app.${slug}.toml`;

  if (newTomlFilename !== tomlFilename) {
    renameSync(tomlPath, join(root, newTomlFilename));
    console.log(clr('Renamed:', 'cyan'), `${tomlFilename} → ${newTomlFilename}`);
  }

  return { appName, tomlFilename: newTomlFilename };
}

function readExampleConfig(root: string): { scopes: string; apiVersion: string } {
  const content = readFileSync(join(root, 'shopify.app.example.toml'), 'utf-8');
  return {
    scopes: content.match(/^scopes\s*=\s*"(.+)"/m)?.[1] ?? '',
    apiVersion: content.match(/^api_version\s*=\s*"(.+)"/m)?.[1] ?? '2025-07',
  };
}

function patchToml(
  content: string,
  config: { appName: string; tunnelUrl: string; scopes: string; apiVersion: string },
): string {
  const { appName, tunnelUrl, scopes, apiVersion } = config;
  let toml = content;

  toml = toml.replace(/^# Learn more about configuring.*\n\n?/m, '');

  toml = toml.replace(/^name\s*=\s*.+$/m, `name = "${appName}"`);
  toml = toml.replace(/^application_url\s*=\s*.+$/m, `application_url = "${tunnelUrl}"`);

  toml = toml.replace(
    ...((/^embedded\s*=/m.test(toml)
      ? [/^embedded\s*=\s*.+$/m, 'embedded = false']
      : [/^(application_url\s*=\s*.+)$/m, '$1\nembedded = false']) as [string | RegExp, string]),
  );

  toml = toml.replace(/^\[build\]\n(?:.*\n)*?(?=\n*(?:\[|$))/m, '');

  toml = /^\[access_scopes\]/m.test(toml)
    ? toml.replace(/^(\[access_scopes\]\n)(?:#.*\n)*scopes\s*=\s*.+$/m, `$1scopes = "${scopes}"`)
    : toml + `\n[access_scopes]\nscopes = "${scopes}"\n`;

  toml = /^\[auth\]/m.test(toml)
    ? toml.replace(
        /^(\[auth\]\n)(?:#.*\n)*redirect_urls\s*=\s*.+$/m,
        `$1redirect_urls = [ "${tunnelUrl}/auth/callback" ]`,
      )
    : toml + `\n[auth]\nredirect_urls = [ "${tunnelUrl}/auth/callback" ]\n`;

  toml = /^\[webhooks\]/m.test(toml)
    ? toml.replace(
        /^(\[webhooks\]\n)(?:#.*\n)*api_version\s*=\s*.+$/m,
        `$1api_version = "${apiVersion}"`,
      )
    : toml + `\n[webhooks]\napi_version = "${apiVersion}"\n`;

  toml = toml.replace(/\n{3,}/g, '\n\n');

  return toml;
}

function printSummary(
  tomlFilename: string,
  config: { appName: string; tunnelUrl: string; scopes: string; apiVersion: string },
): void {
  const { appName, tunnelUrl, scopes, apiVersion } = config;
  console.log(`\n${clr('✔', 'green', 'bold')} ${clr(tomlFilename, 'cyan')} configured:\n`);
  console.log(`  ${clr('name', 'dim')}             ${appName}`);
  console.log(`  ${clr('application_url', 'dim')}  ${clr(tunnelUrl, 'blue')}`);
  console.log(`  ${clr('embedded', 'dim')}         false`);
  console.log(`  ${clr('redirect_urls', 'dim')}    ${clr(`${tunnelUrl}/auth/callback`, 'blue')}`);
  console.log(`  ${clr('scopes', 'dim')}           ${scopes.slice(0, 60)}...`);
  console.log(`  ${clr('api_version', 'dim')}      ${apiVersion}`);
  console.log(`\n${clr('Next:', 'green', 'bold')} update the access scopes if needed`);
  console.log(`${clr('Deploy:', 'green', 'bold')}`, clr('shopify app deploy', 'yellow'));
}

// Main
async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');

  console.log(`\n${clr('▸ Configuring Shopify app toml', 'cyan', 'bold')}`);
  console.log(
    `${clr('  Overriding CLI defaults with values from .env and example toml...', 'dim')}\n`,
  );

  const tomlFilename = findTomlFile(root);
  console.log(clr('Found:', 'cyan'), tomlFilename);

  const tunnelUrl = getEnvTunnelUrl();
  const { appName, tomlFilename: finalFilename } = await resolveAppName(root, tomlFilename);
  const { scopes, apiVersion } = readExampleConfig(root);

  const config = { appName, tunnelUrl, scopes, apiVersion };
  const tomlPath = join(root, finalFilename);
  const patched = patchToml(readFileSync(tomlPath, 'utf-8'), config);
  writeFileSync(tomlPath, patched, 'utf-8');

  printSummary(finalFilename, config);
}

main();
