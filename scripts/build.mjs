// Builds the extension for each browser from src/:
//   dist/chrome/   + dist/gramkit-chrome-<version>.zip
//   dist/firefox/  + dist/gramkit-firefox-<version>.xpi  (Zen, Firefox)
//
//   node scripts/build.mjs           # one build
//   node scripts/build.mjs --watch   # rebuild dist/chrome and dist/firefox on change, no archives

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const WATCH = process.argv.includes('--watch');
const { version, description } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const NAME = 'Gramkit';
const INSTAGRAM = 'https://www.instagram.com/*';

const ENTRIES = {
  content: 'src/content/main.ts',
  background: 'src/background.ts',
  'popup/popup': 'src/popup/popup.ts',
  'options/options': 'src/options/options.ts',
};

const base = {
  manifest_version: 3,
  name: NAME,
  version,
  description: `${description.split('. Chrome')[0]}.`,
  permissions: ['storage'],
  host_permissions: [INSTAGRAM],
  icons: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
  action: {
    default_title: NAME,
    default_popup: 'popup/popup.html',
    default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png' },
  },
  options_ui: { page: 'options/options.html', open_in_tab: true },
  content_scripts: [{ matches: [INSTAGRAM], js: ['content.js'], run_at: 'document_start' }],
};

const targets = {
  chrome: {
    manifest: { ...base, background: { service_worker: 'background.js' }, minimum_chrome_version: '116' },
    file: `gramkit-chrome-${version}.zip`,
  },
  firefox: {
    manifest: {
      ...base,
      // Firefox runs MV3 backgrounds as event pages, not service workers.
      background: { scripts: ['background.js'] },
      browser_specific_settings: {
        gecko: {
          id: 'gramkit@anyrobert',
          strict_min_version: '128.0',
          data_collection_permissions: { required: ['none'] },
        },
      },
    },
    file: `gramkit-firefox-${version}.xpi`,
  },
};

function copyStatic(dir) {
  fs.cpSync(path.join(SRC, 'static'), dir, { recursive: true, filter: (p) => !path.basename(p).startsWith('.') });
}

function writeManifest(dir, manifest) {
  fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

const buildOptions = (outdir) => ({
  absWorkingDir: ROOT,
  entryPoints: ENTRIES,
  outdir,
  bundle: true,
  format: 'iife',
  target: ['chrome116', 'firefox128'],
  legalComments: 'none',
  logLevel: 'warning',
});

fs.mkdirSync(DIST, { recursive: true });

if (WATCH) {
  for (const [name, { manifest }] of Object.entries(targets)) {
    const dir = path.join(DIST, name);
    fs.rmSync(dir, { recursive: true, force: true });
    copyStatic(dir);
    writeManifest(dir, manifest);
    const ctx = await esbuild.context(buildOptions(dir));
    await ctx.watch();
  }
  fs.watch(path.join(SRC, 'static'), { recursive: true }, () => {
    for (const name of Object.keys(targets)) copyStatic(path.join(DIST, name));
  });
  console.log('watching src/ → dist/chrome, dist/firefox');
} else {
  for (const [name, { manifest, file }] of Object.entries(targets)) {
    const dir = path.join(DIST, name);
    const archive = path.join(DIST, file);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(archive, { force: true });
    copyStatic(dir);
    writeManifest(dir, manifest);
    await esbuild.build(buildOptions(dir));
    execFileSync('zip', ['-r', '-X', '-q', archive, '.'], { cwd: dir });
    console.log(`${name.padEnd(8)} dist/${name}/  dist/${file}`);
  }
}
