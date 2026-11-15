// Packs every library folder in src/ into libraries/<id>.benchlib and rewrites index.json (the list
// the app reads). Runs on GitHub after a pull request is merged; locally: node tools/pack.mjs
// Each library must pass the safety check (tools/safety.mjs) or nothing is written.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLibrarySafety, safetyReport } from './safety.mjs';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A library folder (library.json + device.js + sketch/*.js + models) as one library object. */
export function readFolder(dir) {
  const lib = JSON.parse(readFileSync(join(dir, 'library.json'), 'utf8'));
  const fail = (m) => { throw new Error(`${dir.split(/[\\/]/).pop()}: ${m}`); };
  if (lib.format !== 'bench-library') fail('format must be "bench-library"');
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(lib.id ?? '')) fail('id must be lowercase letters, digits and dashes');
  for (const k of ['name', 'version', 'author', 'description']) if (!lib[k]) fail(`no ${k}`);
  if (!/^\d+\.\d+\.\d+$/.test(lib.version)) fail('version must look like 1.0.0');
  const inside = (f) => {
    const p = resolve(dir, f);
    if (!p.startsWith(resolve(dir))) fail(`${f} is outside the library's folder`);
    if (!existsSync(p)) fail(`${f} is missing`);
    return p;
  };
  if (typeof lib.code === 'string' && /\.js$/.test(lib.code)) lib.code = readFileSync(inside(lib.code), 'utf8');
  for (const [name, f] of Object.entries(lib.sketch ?? {})) {
    if (f.file) {
      f.code = readFileSync(inside(f.file), 'utf8');
      delete f.file;
    }
    if (typeof f.code !== 'string') fail(`sketch library ${name} has no code`);
  }
  for (const ex of lib.examples ?? []) {
    if (ex.file) {
      ex.project = JSON.parse(readFileSync(inside(ex.file), 'utf8'));
      delete ex.file;
    }
    if (ex.project?.format !== 'bench-workshop') fail(`example ${ex.name}: not a .bench project`);
  }
  for (const p of lib.parts ?? []) {
    if (p.glbFile) {
      p.glb = readFileSync(inside(p.glbFile)).toString('base64');
      delete p.glbFile;
    }
    if (p.device && !lib.code) fail(`part ${p.id} uses device "${p.device}" but there's no code`);
    if (p.device && !/^[\w-]{1,64}$/.test(p.device)) fail(`part ${p.id}: device names are letters, digits, - and _`);
    if (p.device && !new RegExp(`bench\\.device\\(\\s*['"]${p.device}['"]`).test(lib.code)) fail(`part ${p.id}: the code never registers device "${p.device}"`);
  }
  return lib;
}

/** what a library's parts do that someone would want to know before installing it */
export function abilities(lib) {
  const parts = lib.parts ?? [];
  const out = [];
  if (parts.some((p) => p.moving?.length)) out.push('move');
  if (parts.some((p) => p.sound)) out.push('make sounds');
  if (parts.some((p) => p.controls?.length)) out.push('have controls in the run panel');
  if (parts.some((p) => [...(p.shape ?? []), ...(p.moving ?? []).flatMap((m) => m.shape ?? [])].some((s) => s.camera))) out.push('see (camera)');
  const items = (p) => [...(p.shape ?? []), ...(p.moving ?? []).flatMap((m) => m.shape ?? [])];
  if (parts.some((p) => items(p).some((s) => s.ranger))) out.push('measure distance');
  if (parts.some((p) => items(p).some((s) => s.touch !== undefined))) out.push('feel touch');
  if (parts.some((p) => items(p).some((s) => s.light))) out.push('sense light');
  if (parts.some((p) => p.hear)) out.push('hear sounds');
  if (/\bpart\s*\.\s*motion\s*\(/.test(lib.code ?? '')) out.push('feel motion');
  if (parts.some((p) => p.spi)) out.push('talk SPI');
  return out;
}

export function libraryFolders() {
  const src = join(root, 'src');
  return existsSync(src) ? readdirSync(src).sort().map((n) => join(src, n)).filter((d) => statSync(d).isDirectory() && existsSync(join(d, 'library.json'))) : [];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = join(root, 'libraries');
  mkdirSync(outDir, { recursive: true });
  const entries = [];
  let blocked = 0;
  const packed = [];
  for (const dir of libraryFolders()) {
    const lib = readFolder(dir);
    const text = JSON.stringify(lib);
    const safe = checkLibrarySafety(lib, text.length);
    for (const line of safetyReport(safe)) console.log(`  ${lib.id}: ${line}`);
    if (!safe.ok) {
      blocked++;
      continue;
    }
    packed.push([lib, text]);
  }
  if (blocked) {
    console.error(`${blocked} libraries failed the safety check: nothing written`);
    process.exit(1);
  }
  for (const [lib, text] of packed) {
    const file = join(outDir, `${lib.id}.benchlib`);
    writeFileSync(file, text);
    entries.push({
      id: lib.id, name: lib.name, version: lib.version, author: lib.author, description: lib.description, category: lib.category,
      parts: lib.parts.map((p) => p.name), url: `libraries/${lib.id}.benchlib`, size: text.length,
      can: abilities(lib), ...(lib.needsApp ? { needsApp: lib.needsApp } : {}),
    });
    console.log(`packed ${lib.id} ${lib.version} (${lib.parts.length} parts, ${(text.length / 1024).toFixed(1)} KB)`);
  }
  writeFileSync(join(root, 'index.json'), JSON.stringify({ format: 'bench-library-index', libraries: entries }, null, 1) + '\n');
  console.log(`index.json: ${entries.length} libraries`);
}
