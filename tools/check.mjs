// The check every pull request gets (GitHub Actions, .github/workflows/check.yml), and anyone can
// run: node tools/check.mjs
// For every library folder: it must read and pack, pass the safety check, and a changed library
// must have a newer version than the one already on the list. Exits 1 if anything is blocked.
// The report also goes to the pull request's checks page (GITHUB_STEP_SUMMARY).
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { libraryFolders, readFolder, root } from './pack.mjs';
import { checkLibrarySafety, safetyReport } from './safety.mjs';

const newer = (a, b) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
};

const lines = ['## Library safety check', ''];
let failed = 0;
for (const dir of libraryFolders()) {
  const name = dir.split(/[\\/]/).pop();
  let lib;
  try {
    lib = readFolder(dir);
  } catch (e) {
    failed++;
    lines.push(`- **${name}**: BLOCKED: ${e.message}`);
    continue;
  }
  const text = JSON.stringify(lib);
  const safe = checkLibrarySafety(lib, text.length);
  const problems = safetyReport(safe);
  if (lib.id !== name) problems.push(`BLOCKED: folder: the folder must be named after the library's id (${lib.id})`);
  // a changed library needs a new version, or nobody gets the update
  const listed = join(root, 'libraries', `${lib.id}.benchlib`);
  if (existsSync(listed)) {
    const old = JSON.parse(readFileSync(listed, 'utf8'));
    if (JSON.stringify({ ...old, version: '' }) !== JSON.stringify({ ...lib, version: '' }) && !newer(lib.version, old.version))
      problems.push(`BLOCKED: version: it changed, so its version must go up from ${old.version}`);
  }
  const bad = problems.some((p) => p.startsWith('BLOCKED'));
  if (bad) failed++;
  lines.push(`- **${lib.name}** (${lib.id} ${lib.version}, by ${lib.author}): ${bad ? 'BLOCKED' : 'passed'}`);
  for (const p of problems) lines.push(`  - ${p}`);
  if (lib.code) lines.push(`  - has device code (${(lib.code.length / 1024).toFixed(1)} KB): read it before merging`);
  for (const s of Object.keys(lib.sketch ?? {})) lines.push(`  - has sketch library ${s}: read it before merging`);
}
lines.push('', failed ? `**${failed} blocked.**` : 'Everything passed the automatic check. A person still reads the code before merging.');
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
process.exit(failed ? 1 : 0);
