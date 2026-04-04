/**
 * Post-clone setup: select a preset to prune the template down to
 * just the files you need, then run database setup automatically.
 *
 * Usage:
 *   npm run init              # interactive preset picker
 *   npm run init -- content   # content management only
 *   npm run init -- scripts   # migration/batch scripts only
 *   npm run init -- full      # keep everything
 *
 * Flags:
 *   --yes, -y                 # skip confirmation (for CI)
 */

import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { createInterface } from 'readline';
import { execSync } from 'child_process';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

// ── Paths ───────────────────────────────────────────────────────────

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SCRIPT_PATH), '..');
const PKG_PATH = join(ROOT, 'package.json');

// ── Preset definitions ──────────────────────────────────────────────
//
// removeFiles — individual files (config, entry points, commands)
// removeDirs  — entire directories (drop a new file in and it's auto-handled)

interface Preset {
  label: string;
  description: string;
  removeFiles: string[];
  removeDirs: string[];
  removeDeps: string[];
  removeDevDeps: string[];
  removeScripts: string[];
}

const PRESETS: Record<string, Preset> = {
  content: {
    label: 'Content Management',
    description:
      'Ad-hoc GraphQL via CLI + Claude-assisted content management.\n' +
      '  Removes: pagination runner, progress tracking, batch utilities, codegen.',
    removeFiles: ['.graphqlrc.ts'],
    removeDirs: ['scripts/lib/migration', 'scripts/examples', 'types'],
    removeDeps: [],
    removeDevDeps: ['@shopify/api-codegen-preset'],
    removeScripts: ['graphql-codegen'],
  },

  scripts: {
    label: 'Custom Scripts',
    description:
      'Batch operations, migrations, paginated fetches with progress tracking.\n' +
      '  Removes: gql CLI tool, reusable query files, Claude content-management commands.',
    removeFiles: [
      'scripts/gql.ts',
      '.claude/commands/store-content.md',
      '.claude/commands/add-icon.md',
    ],
    removeDirs: ['queries'],
    removeDeps: [],
    removeDevDeps: [],
    removeScripts: ['gql'],
  },

  full: {
    label: 'Full',
    description: 'Keep everything — content management + custom scripts. No files removed.',
    removeFiles: [],
    removeDirs: [],
    removeDeps: [],
    removeDevDeps: [],
    removeScripts: [],
  },
};

const SELF_SCRIPT_KEY = 'init';
const VALID_PRESETS = Object.keys(PRESETS);

// ── Helpers ─────────────────────────────────────────────────────────

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function log(msg: string) {
  console.log(`  ${msg}`);
}

function logHeader(msg: string) {
  console.log(`\n${msg}`);
}

function removePath(relativePath: string, kind: 'file' | 'dir'): boolean {
  const abs = join(ROOT, relativePath);
  if (!existsSync(abs)) return false;
  rmSync(abs, { recursive: kind === 'dir', force: true });
  return true;
}

function isDirEmpty(relativePath: string): boolean {
  const abs = join(ROOT, relativePath);
  if (!existsSync(abs)) return false;
  try {
    return readdirSync(abs).length === 0;
  } catch {
    return false;
  }
}

function readPkg(): Record<string, any> {
  return JSON.parse(readFileSync(PKG_PATH, 'utf-8'));
}

function writePkg(pkg: Record<string, any>) {
  writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');
}

// ── Preset picker (interactive) ─────────────────────────────────────

async function pickPreset(): Promise<string> {
  logHeader('Available presets:\n');

  VALID_PRESETS.forEach((key, i) => {
    const p = PRESETS[key];
    console.log(`  [${i + 1}] ${p.label}`);
    console.log(`      ${p.description.split('\n').join('\n      ')}`);
    console.log();
  });

  const answer = await ask('Select a preset (number or name): ');

  const num = parseInt(answer, 10);
  if (num >= 1 && num <= VALID_PRESETS.length) return VALID_PRESETS[num - 1];

  const normalized = answer.toLowerCase();
  if (PRESETS[normalized]) return normalized;

  console.error(`\nUnknown preset: "${answer}". Expected: ${VALID_PRESETS.join(', ')}`);
  process.exit(1);
}

// ── Preflight checks ────────────────────────────────────────────────

function preflight(): void {
  if (!existsSync(PKG_PATH)) {
    console.error('Error: package.json not found. Run this from the project root.');
    process.exit(1);
  }

  const pkg = readPkg();
  if (!pkg.scripts?.[SELF_SCRIPT_KEY]) {
    console.error(
      'Error: Setup has already been run (no "init" script in package.json).\n' +
        'If you need to re-run, restore the template files first.',
    );
    process.exit(1);
  }

  if (!existsSync(join(ROOT, 'node_modules'))) {
    console.error(
      'Error: node_modules not found. Run "npm install" before running setup.\n' +
        'The setup script needs tsx to execute.',
    );
    process.exit(1);
  }
}

// ── Parse CLI args ──────────────────────────────────────────────────

function parseArgs(): { preset?: string; yes: boolean } {
  const args = process.argv.slice(2);
  const yes = args.includes('--yes') || args.includes('-y');
  const positional = args.filter((a) => !a.startsWith('-'));
  const preset = positional[0]?.toLowerCase();

  if (preset && !PRESETS[preset]) {
    console.error(`Unknown preset: "${preset}". Expected: ${VALID_PRESETS.join(', ')}`);
    process.exit(1);
  }

  return { preset, yes };
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  preflight();

  const { preset: argPreset, yes } = parseArgs();
  const presetKey = argPreset ?? (await pickPreset());
  const preset = PRESETS[presetKey];

  // ── Summarize ──────────────────────────────────────────────────

  logHeader(`Preset: ${preset.label}`);

  if (presetKey === 'full') {
    log('No files will be removed.');
  } else {
    const allRemovals = [
      ...preset.removeFiles,
      ...preset.removeDirs.map((d) => `${d}/`),
    ];
    logHeader('Files to remove:');
    allRemovals.forEach((f) => log(`  - ${f}`));

    if (preset.removeDevDeps.length > 0 || preset.removeDeps.length > 0) {
      logHeader('Dependencies to remove:');
      [...preset.removeDeps, ...preset.removeDevDeps].forEach((d) => log(`  - ${d}`));
    }

    if (preset.removeScripts.length > 0) {
      logHeader('npm scripts to remove:');
      preset.removeScripts.forEach((s) => log(`  - ${s}`));
    }
  }

  log('');
  logHeader('After pruning, these commands will run automatically:');
  log('  npm install');
  log('  npx prisma generate');
  log('  npx prisma migrate deploy');

  if (!yes) {
    console.log();
    const confirm = await ask('Proceed? (y/N): ');
    if (confirm.toLowerCase() !== 'y') {
      console.log('Aborted.');
      process.exit(0);
    }
  } else {
    console.log('\n  --yes flag set, skipping confirmation.\n');
  }

  // ── Remove files and directories ───────────────────────────────

  let removed = 0;
  let skipped = 0;

  for (const file of preset.removeFiles) {
    if (removePath(file, 'file')) {
      removed++;
      log(`Removed ${file}`);
    } else {
      skipped++;
    }
  }

  for (const dir of preset.removeDirs) {
    if (removePath(dir, 'dir')) {
      removed++;
      log(`Removed ${dir}/`);
    } else {
      skipped++;
    }
  }

  // Clean up empty parent directories left behind
  const parentDirs = new Set<string>();
  for (const file of preset.removeFiles) {
    const parent = dirname(file);
    if (parent !== '.') parentDirs.add(parent);
  }
  for (const dir of preset.removeDirs) {
    const parent = dirname(dir);
    if (parent !== '.') parentDirs.add(parent);
  }
  for (const dir of parentDirs) {
    if (isDirEmpty(dir)) {
      removePath(dir, 'dir');
      log(`Removed empty directory ${dir}/`);
    }
  }

  if (skipped > 0) {
    log(`(${skipped} path(s) already missing — skipped)`);
  }

  // ── Update package.json ────────────────────────────────────────

  logHeader('Updating package.json...');
  const pkg = readPkg();

  for (const dep of preset.removeDeps) {
    if (pkg.dependencies?.[dep]) {
      delete pkg.dependencies[dep];
      log(`Removed dependency: ${dep}`);
    }
  }
  for (const dep of preset.removeDevDeps) {
    if (pkg.devDependencies?.[dep]) {
      delete pkg.devDependencies[dep];
      log(`Removed devDependency: ${dep}`);
    }
  }

  for (const script of preset.removeScripts) {
    if (pkg.scripts?.[script]) {
      delete pkg.scripts[script];
      log(`Removed script: ${script}`);
    }
  }

  if (pkg.scripts?.[SELF_SCRIPT_KEY]) {
    delete pkg.scripts[SELF_SCRIPT_KEY];
    log(`Removed script: ${SELF_SCRIPT_KEY}`);
  }

  writePkg(pkg);
  log('package.json updated.');

  // ── Self-destruct ──────────────────────────────────────────────

  rmSync(SCRIPT_PATH, { force: true });
  log('Removed setup script.');

  // ── Run post-setup commands ────────────────────────────────────

  logHeader('Running npm install...\n');
  try {
    execSync('npm install', { cwd: ROOT, stdio: 'inherit' });
  } catch {
    console.error('\nnpm install failed. Fix the issue and run manually:');
    console.error('  npm install && npx prisma generate && npx prisma migrate deploy');
    process.exit(1);
  }

  logHeader('Running prisma generate...\n');
  try {
    execSync('npx prisma generate', { cwd: ROOT, stdio: 'inherit' });
  } catch {
    console.error('\nprisma generate failed. Fix the issue and run manually:');
    console.error('  npx prisma generate && npx prisma migrate deploy');
    process.exit(1);
  }

  logHeader('Running prisma migrate deploy...\n');
  try {
    execSync('npx prisma migrate deploy', { cwd: ROOT, stdio: 'inherit' });
  } catch {
    console.error('\nprisma migrate deploy failed. Fix the issue and run manually:');
    console.error('  npx prisma migrate deploy');
    process.exit(1);
  }

  // ── Done ───────────────────────────────────────────────────────

  logHeader('Setup complete!');
  console.log();

  if (presetKey === 'content') {
    log('Run ad-hoc queries:     npm run gql -- \'{ shop { name } }\'');
    log('Claude content mgmt:    /store-content <describe what you need>');
  } else if (presetKey === 'scripts') {
    log('Example script:         npx tsx scripts/examples/getAllProducts.ts');
    log('See:                    scripts/examples/ for the paginated-fetch pattern');
  } else {
    log('Run ad-hoc queries:     npm run gql -- \'{ shop { name } }\'');
    log('Example script:         npx tsx scripts/examples/getAllProducts.ts');
  }

  console.log();
}

main().catch((err) => {
  console.error('Unexpected error during setup:', err);
  process.exit(1);
});
