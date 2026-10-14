// Packs the source the Firefox build is made from, for addons.mozilla.org review:
//   dist/gramkit-source-<version>.zip
//
// Taken from the last commit, so commit first. Reviewers rebuild with
//   npm ci && npm run build   →   dist/firefox/

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const PATHS = ['src', 'scripts/build.mjs', 'package.json', 'package-lock.json', 'tsconfig.json', 'README.md', 'LICENSE'];

const dirty = execFileSync('git', ['status', '--porcelain', '--', ...PATHS], { cwd: ROOT }).toString().trim();
if (dirty) console.warn(`uncommitted changes left out of the archive:\n${dirty}`);

const out = path.join(ROOT, 'dist', `gramkit-source-${version}.zip`);
fs.mkdirSync(path.dirname(out), { recursive: true });
execFileSync('git', ['archive', '--format=zip', `--prefix=gramkit-${version}/`, '-o', out, 'HEAD', '--', ...PATHS], { cwd: ROOT });
console.log(`source   dist/${path.basename(out)}`);
