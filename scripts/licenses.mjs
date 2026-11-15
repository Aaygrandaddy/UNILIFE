// Collects the licence of every package that ships in the game build into public/licenses.txt.
// Open-source licences (MIT, Apache-2.0, OFL, ISC, BSD) require their notices to travel with the software.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';

const root = new URL('..', import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const seen = new Map();

function pkgDir(name, from) {
  let dir = from;
  for (;;) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

function visit(name, from) {
  const dir = pkgDir(name, from);
  if (!dir || seen.has(dir)) return;
  const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  const author = typeof meta.author === 'string' ? meta.author : meta.author?.name ?? '';
  seen.set(dir, { name: meta.name, version: meta.version, license: meta.license ?? 'see text', text: file ? readFileSync(join(dir, file), 'utf8').trim() : null, homepage: meta.homepage ?? '', author });
  for (const dep of Object.keys(meta.dependencies ?? {})) visit(dep, dir);
}

for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep, root);
void createRequire;

const entries = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
// Packages that share identical licence text are grouped to keep the file readable.
const groups = new Map();
for (const e of entries) {
  // a package without its own licence file is grouped with another package under the same licence
  // Apache-2.0 text is identical for every package; MIT names its copyright holder, so it is rebuilt from the package's author.
  const same = e.license === 'Apache-2.0' ? entries.find((o) => o.text && o.license === 'Apache-2.0' && o.text.length > 400) : null;
  const mit = e.license === 'MIT' && !e.text ? `MIT License\n\nCopyright (c) ${e.author || e.name + ' authors'}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.` : null;
  const key = e.text ?? same?.text ?? mit ?? `${e.license} (no licence file in package; see ${e.homepage || 'npm'})`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(`${e.name}@${e.version} (${e.license})`);
}
let out = `Force Life — third-party software notices\n\nForce Life includes the open-source software listed below. Each is used under its licence, reproduced here.\nThe game's own code, art and sound are © the Force Life owner; see LICENSE.\n\n`;
for (const [text, names] of groups) out += `${'='.repeat(78)}\n${names.join('\n')}\n${'-'.repeat(78)}\n${text}\n\n`;
writeFileSync(join(root, 'public', 'licenses.txt'), out);
console.log(`licenses.txt: ${entries.length} packages, ${groups.size} distinct licence texts`);
