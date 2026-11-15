// Decompiles a .benchlib back into the folder it was packed from: library.json (code as file names),
// device.js, sketch/*.js and models/*.glb. tools/pack.mjs inlines all of that into one JSON file;
// this is the way back, so a library someone shared can be read, reviewed or edited like src/<id>.
//   node tools/unpack.mjs libraries/lcd-i2c.benchlib [outDir]
// Without outDir it writes to unpacked/<id>/ next to the libraries folder.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** A library file's contents as its folder's files: [{ path, text }], or [{ path, b64 }] for a 3D model. */
export function unpackLibrary(raw) {
  const lib = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!lib || lib.format !== 'bench-library') throw new Error('not a Bench Workshop library (format is not "bench-library")');
  const files = [];
  const meta = JSON.parse(JSON.stringify(lib));
  if (typeof lib.code === 'string') {
    meta.code = 'device.js';
    files.push({ path: 'device.js', text: lib.code });
  }
  for (const [name, f] of Object.entries(lib.sketch ?? {})) {
    const file = `sketch/${name.replace(/\.h$/, '')}.js`;
    const { code, ...rest } = f;
    meta.sketch[name] = { classes: rest.classes ?? [], ...rest, file };
    files.push({ path: file, text: code ?? '' });
  }
  for (const p of meta.parts ?? []) {
    if (typeof p.glb === 'string') {
      const file = `models/${p.id}.glb`;
      files.push({ path: file, b64: p.glb });
      p.glbFile = file;
      delete p.glb;
    }
  }
  files.unshift({ path: 'library.json', text: JSON.stringify(meta, null, 2) + '\n' });
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [file, outArg] = process.argv.slice(2);
  if (!file) {
    console.error('usage: node tools/unpack.mjs <library.benchlib> [outDir]');
    process.exit(1);
  }
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (e) {
    console.error(`can't read ${file}: ${e.message}`);
    process.exit(1);
  }
  let files, lib;
  try {
    lib = JSON.parse(raw);
    files = unpackLibrary(lib);
  } catch (e) {
    console.error(`${file}: ${e.message}`);
    process.exit(1);
  }
  const outDir = outArg ? resolve(outArg) : join(dirname(resolve(file)), '..', 'unpacked', lib.id);
  for (const f of files) {
    const to = join(outDir, f.path);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, f.b64 ? Buffer.from(f.b64.replace(/^data:[^,]*,/, ''), 'base64') : f.text);
    console.log(`  ${f.path}${f.b64 ? ' (3D model)' : ` (${f.text.length} B)`}`);
  }
  console.log(`unpacked ${lib.id} ${lib.version} into ${outDir}`);
}
