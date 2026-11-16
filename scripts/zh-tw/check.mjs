#!/usr/bin/env node
// zh-TW quality gate. Run from the repo root on the zh-tw branch, after
// convert.mjs and `npm run build`. Exits 1 and prints every failure when the
// tree is not fully in the zh-TW state. Used by sync.sh and the daily job.
//
// Gates:
//  1. No zh-CN filenames, no zh-CN.md references anywhere, and zh-CN tag
//     mentions only where they describe the product's language handling.
//  2. No Simplified-only characters in reader-facing content; elsewhere only
//     in allowlisted product internals (the Hans language pack, the Hans
//     word list, the han-forms table, test fixtures, quoted examples).
//  3. Settled Taiwan vocabulary: wrong forms count zero in content.
//  4. Idempotence: OpenCC (cn -> tw2) over converted content changes nothing.
//  5. Every relative .md link in the zh-TW docs resolves; none names zh-CN.
//  6. No QingYunA/answer-me-with-html slug remains (installs point at the fork).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { applyVocab } from './vocab.mjs';
import path from 'node:path';

const root = process.cwd();
const OCC = process.env.OPENCC || 'opencc-cli';
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const globMd = (dir, suffix) =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(suffix))
    .map((e) => path.join(dir, e.name));

const CONTENT = [
  'README.zh-TW.md',
  ...globMd('docs', '.zh-TW.md'),
  'site/i18n/zh.js',
  ...globMd('site/presets', '.zh.md'),
  ...globMd('site/presets/components', '.zh.md'),
  'examples/tcp.md', 'examples/video-tcp.md', 'examples/architecture.md',
  ...globMd('changelog', '.md'),
  'bench/README.md',
  'locale/zh.json',
  ...globMd('marketplace/themes', '.json'),
  'docs/demo/demo.html',
  'skills/answer-me-with-html/SKILL.md',
  'skills/answer-me-with-html/references/video.md',
  '.gitignore', '.gitattributes', '.github/workflows/ci.yml',
].filter(exists);

const failures = [];
const fail = (gate, msg) => failures.push(`[gate ${gate}] ${msg}`);

// Gate 1: zh-CN residue.
const TAG_OK = /^(src\/|test\/|changelog\/|scripts\/zh-tw\/|docs\/reference\.md$|docs\/reference\.zh-TW\.md$|skills\/answer-me-with-html\/scripts\/am\.mjs$)/;
const walk = (d, out = []) => {
  for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist'].includes(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.name.includes('zh-CN')) fail(1, `zh-CN filename remains: ${p}`);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};
const TEXT_FILES = walk('.').filter((f) => {
  try { return !fs.readFileSync(path.join(root, f)).includes(0); } catch { return false; }
});
for (const f of TEXT_FILES) {
  const t = read(f);
  if (t.includes('zh-CN.md') && !f.startsWith('scripts/zh-tw/')) fail(1, `zh-CN.md reference in ${f}`);
  else if (t.includes('zh-CN') && !TAG_OK.test(f)) fail(1, `zh-CN mention outside the language-handling allowlist: ${f}`);
  if (t.includes('zh_CN') && !TAG_OK.test(f) && !f.startsWith('src/')) fail(1, `zh_CN mention outside allowlist: ${f}`);
}

// Gate 2: Simplified-only characters (pairs table from the product itself).
const { SIMPLIFIED_ONLY } = await import(path.join(root, 'src/han-forms.js'));
const SIMP = new Set([...SIMPLIFIED_ONLY]);
const simpCount = (t) => { let c = 0; for (const ch of t) if (SIMP.has(ch)) c++; return c; };
for (const f of CONTENT) {
  const c = simpCount(read(f));
  if (c) fail(2, `${c} Simplified-only characters in content file ${f}`);
}
const SIMP_OK = /^(src\/|test\/|scripts\/zh-tw\/|docs\/reference\.md$|scripts\/smoke-install\.mjs$)/;
for (const f of TEXT_FILES) {
  if (CONTENT.includes(f) || SIMP_OK.test(f) || f.endsWith('scripts/am.mjs')) continue;
  const c = simpCount(read(f));
  if (c) fail(2, `${c} Simplified-only characters in ${f} (not content, not allowlisted)`);
}

// Gate 3: vocabulary.
const WRONG = ['視頻', '信息', '消息', '數據', '點擊', '用戶', '軟件', '網絡', '屏幕', '默認', '質量', '訪問', '打印', '緩存', '配置', '保存', '註釋', '端口', '局域網', '賬', '羣', '寫程式'];
for (const f of CONTENT) {
  const t = read(f);
  for (const w of WRONG) if (t.includes(w)) fail(3, `wrong-form 「${w}」 in ${f}`);
  // 登錄 is allowed once in reference.zh-TW.md, inside the quoted Hans word list.
  const login = (t.match(/登錄/g) || []).length;
  if (login && !(f === 'docs/reference.zh-TW.md' && login === 1 && t.includes('登陸→登錄'))) {
    fail(3, `登錄 x${login} in ${f} (expected 登入)`);
  }
}

// Gate 4: idempotence.
for (const f of CONTENT) {
  let out = execFileSync(OCC, ['-f', 'cn', '-t', 'tw2'], { cwd: root, input: read(f), encoding: 'utf8' });
  out = applyVocab(out);
  if (f === '.github/workflows/ci.yml') out = out.split('ffmpeg 寫程式').join('ffmpeg 編碼');
  if (f === 'docs/reference.zh-TW.md') out = out.split('登陸→登入').join('登陸→登錄'); // quoted Hans word list
  if (out !== read(f)) fail(4, `conversion pipeline is not idempotent for ${f}`);
}

// Gate 5: doc links.
for (const f of ['README.zh-TW.md', ...globMd('docs', '.zh-TW.md')]) {
  const t = read(f);
  for (const m of t.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)) {
    const target = m[1];
    if (/^https?:/.test(target) || !target.endsWith('.md')) continue;
    const resolved = path.normalize(path.join(path.dirname(f), target));
    if (!exists(resolved)) fail(5, `${f} links to missing ${target}`);
  }
}

// Gate 6: slug.
for (const f of TEXT_FILES) {
  if (f.startsWith('scripts/zh-tw/')) continue; // the pipeline names the slug it replaces
  if (read(f).includes('QingYunA/answer-me-with-html')) fail(6, `upstream slug remains in ${f}`);
}

if (failures.length) {
  console.error(`zh-TW check FAILED (${failures.length}):`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`zh-TW check passed: ${CONTENT.length} content files, ${TEXT_FILES.length} text files scanned.`);
