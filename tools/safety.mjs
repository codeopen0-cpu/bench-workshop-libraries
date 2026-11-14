// The library safety checker. One file, used in three places:
//   - the app, before installing any library (and before publishing yours)
//   - tools/check.mjs, on every pull request to the library list (GitHub Actions)
//   - tools/pack.mjs, before a library is packed into the list
// It reads the library as text and data, never runs it. "block" problems stop it (no install, no
// publish, the pull request check fails); "warn" ones are shown to whoever installs or reviews it.
//
// What it guards against: library code reaching the network, files or the app (it runs sealed off
// anyway: this is the second wall), code hidden from review (obfuscation, code built at run time),
// 3D models that fetch things from the internet, oversized files, and markup in names.

const LIMITS = {
  fileBytes: 40 * 1024 * 1024, // a whole .benchlib
  glbBytes: 30 * 1024 * 1024, // one 3D model
  codeBytes: 300 * 1024, // device + sketch code
  parts: 100,
  pinsPerPart: 600,
  lineLength: 1000,
};

// [pattern, why] for library code. Comments are stripped first, strings are kept (code hidden in a
// string still has to be turned into code, which is blocked below).
const BLOCKED_CODE = [
  [/\b(fetch|XMLHttpRequest|WebSocket|EventSource|WebTransport|sendBeacon)\b/, 'reaches the network'],
  [/\b(importScripts|require)\s*\(|\bimport\s*\(|^\s*import\s|^\s*export\s/m, 'loads other code'],
  [/\b(indexedDB|localStorage|sessionStorage|caches|cookieStore|document\.cookie)\b/, 'reaches stored data'],
  [/\b(SharedWorker|Worker|BroadcastChannel|MessageChannel|ServiceWorker)\b/, 'starts threads or channels of its own'],
  [/\b(postMessage|onmessage|addEventListener)\b/, 'talks to the app behind its back (only bench.device is allowed)'],
  [/__TAURI|\bipc\b|\bwindow\b|\bdocument\b|\bparent\b|\btop\b\s*\.|\bopener\b/, 'reaches for the app window'],
  [/\b(globalThis|self)\b/, 'reaches the global scope'],
  [/\beval\s*\(|\bnew\s+Function\b|\bFunction\s*\(|\bconstructor\s*(\.\s*constructor|\[)|\[\s*['"`]constructor['"`]\s*\]/, 'builds code at run time (hides what it really does)'],
  [/\bset(Timeout|Interval)\s*\(\s*['"`]/, 'runs code from a string'],
  [/\b(Reflect|Proxy)\b|\b__proto__\b|\bdefineProperty\b|\bsetPrototypeOf\b/, 'rewires objects it was given'],
  [/\b(atob|btoa|unescape|decodeURIComponent)\s*\(/, 'decodes hidden text'],
  [/String\.fromCharCode\s*\((\s*\w+\s*,){8,}/, 'spells out text character by character (obfuscation)'],
  [/\bWebAssembly\b/, 'runs WebAssembly'],
];
const WARN_CODE = [
  [/\bwhile\s*\(\s*(true|1)\s*\)|\bfor\s*\(\s*;\s*;\s*\)/, 'has an endless loop (device code must return every step; the app stops a library that freezes)'],
  [/\bMath\.random\b/, 'uses randomness (fine, but runs won\'t repeat exactly)'],
];
const MARKUP = /<\s*(script|iframe|img|svg|object|embed|link|style)\b|javascript:|on\w+\s*=/i;

const stripComments = (code) =>
  code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\])\/\/.*$/gm, '$1');

function obfuscation(code, where, out) {
  const long = code.split('\n').find((l) => l.length > LIMITS.lineLength);
  if (long) out.push({ level: 'block', where, what: `has a line ${long.length} characters long (minified or hidden code can't be reviewed: send the readable source)` });
  const escapes = (code.match(/\\x[0-9a-f]{2}|\\u[0-9a-f]{4}|\\u\{[0-9a-f]+\}/gi) ?? []).length;
  if (escapes > 20) out.push({ level: 'block', where, what: `has ${escapes} escaped characters (text written as \\x.. codes hides what it says)` });
  const blob = /['"`]([A-Za-z0-9+/=]{300,})['"`]/.exec(code);
  if (blob) out.push({ level: 'block', where, what: `has a ${blob[1].length}-character encoded blob in its code (put data in library.json, readable)` });
}

function checkCode(code, where, out, isDevice) {
  if (typeof code !== 'string') return;
  const c = stripComments(code);
  for (const [re, why] of BLOCKED_CODE) {
    const m = re.exec(c);
    if (m) out.push({ level: 'block', where, what: `${why}: "${m[0].trim().slice(0, 40)}" (line ${lineOf(c, m.index)})` });
  }
  if (isDevice) for (const [re, why] of WARN_CODE) {
    const m = re.exec(c);
    if (m) out.push({ level: 'warn', where, what: `${why} (line ${lineOf(c, m.index)})` });
  }
  obfuscation(code, where, out);
}
const lineOf = (s, i) => s.slice(0, i).split('\n').length;

/** A .glb must not point at anything outside itself (it would be fetched from the internet). */
function checkGlb(b64, where, out) {
  if (typeof b64 !== 'string') return out.push({ level: 'block', where, what: 'its 3D model is not base64 text' });
  const bytes = Math.floor((b64.replace(/^data:[^,]*,/, '').length * 3) / 4);
  if (bytes > LIMITS.glbBytes) out.push({ level: 'block', where, what: `its 3D model is ${(bytes / 1048576).toFixed(1)} MB (most is ${LIMITS.glbBytes / 1048576} MB: simplify it in KiCad's export)` });
  let json;
  try {
    const head = decodeB64(b64.replace(/^data:[^,]*,/, '').slice(0, 1_400_000));
    const dv = new DataView(head.buffer);
    if (dv.getUint32(0, true) !== 0x46546c67) return out.push({ level: 'block', where, what: 'its 3D model is not a .glb file' });
    const len = dv.getUint32(12, true);
    if (dv.getUint32(16, true) !== 0x4e4f534a || 20 + len > head.length) return out.push({ level: 'warn', where, what: "its 3D model's header couldn't be read fully (not checked)" });
    json = JSON.parse(new TextDecoder().decode(head.subarray(20, 20 + len)));
  } catch (e) {
    return out.push({ level: 'block', where, what: `its 3D model is damaged (${e?.message ?? e})` });
  }
  for (const k of ['buffers', 'images']) for (const x of json[k] ?? []) if (x.uri && !/^data:/i.test(x.uri)) out.push({ level: 'block', where, what: `its 3D model loads "${String(x.uri).slice(0, 60)}" from outside the file` });
  if (json.extensionsRequired?.length) out.push({ level: 'warn', where, what: `its 3D model needs ${json.extensionsRequired.join(', ')} (may not show)` });
}
function decodeB64(s) {
  s = s.slice(0, s.length - (s.length % 4));
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64'));
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

/**
 * Check a library (the parsed .benchlib object). sizeBytes: the file's size if known.
 * Returns { ok, problems: [{ level: 'block' | 'warn', where, what }] }; ok = nothing blocks it.
 */
export function checkLibrarySafety(lib, sizeBytes) {
  const out = [];
  if (!lib || typeof lib !== 'object') return { ok: false, problems: [{ level: 'block', where: 'file', what: 'not a library' }] };
  if (sizeBytes > LIMITS.fileBytes) out.push({ level: 'block', where: 'file', what: `${(sizeBytes / 1048576).toFixed(1)} MB is too big (most is ${LIMITS.fileBytes / 1048576} MB)` });
  for (const k of ['id', 'name', 'version', 'author', 'description', 'category', 'homepage'])
    if (typeof lib[k] === 'string' && MARKUP.test(lib[k])) out.push({ level: 'block', where: k, what: 'has web markup or script in it' });
  if (lib.homepage && !/^https:\/\/[\w.-]+\//i.test(lib.homepage)) out.push({ level: 'warn', where: 'homepage', what: 'is not an https:// address' });
  const codeSize = (lib.code?.length ?? 0) + Object.values(lib.sketch ?? {}).reduce((s, f) => s + (f?.code?.length ?? 0), 0);
  if (codeSize > LIMITS.codeBytes) out.push({ level: 'block', where: 'code', what: `${Math.round(codeSize / 1024)} KB of code is more than can be reviewed (most is ${LIMITS.codeBytes / 1024} KB)` });
  checkCode(lib.code, 'device code', out, true);
  for (const [name, f] of Object.entries(lib.sketch ?? {})) {
    if (!/^[\w.-]+\.h$/.test(name)) out.push({ level: 'block', where: `sketch ${name}`, what: 'its name must look like Name.h' });
    for (const c of f?.classes ?? []) if (!/^[A-Za-z_]\w*$/.test(c)) out.push({ level: 'block', where: `sketch ${name}`, what: `"${c}" is not a class name` });
    checkCode(f?.code, `sketch ${name}`, out, false);
  }
  const parts = Array.isArray(lib.parts) ? lib.parts : [];
  if (parts.length > LIMITS.parts) out.push({ level: 'block', where: 'parts', what: `${parts.length} parts (most is ${LIMITS.parts})` });
  for (const p of parts) {
    const where = `part ${p?.id}`;
    for (const k of ['name', 'description', 'category'])
      if (typeof p?.[k] === 'string' && MARKUP.test(p[k])) out.push({ level: 'block', where, what: `its ${k} has web markup or script in it` });
    const pins = (p?.pins?.length ?? 0) + (p?.pinRows ?? []).reduce((s, r) => s + (r?.ids?.length ?? 0), 0);
    if (pins > LIMITS.pinsPerPart) out.push({ level: 'block', where, what: `${pins} pins (most is ${LIMITS.pinsPerPart})` });
    if (!(p?.mass > 0 && p.mass < 1e6)) out.push({ level: 'warn', where, what: `weighs ${p?.mass} g` });
    for (const s of p?.shape ?? []) for (const k of ['color']) if (s?.[k] && !/^#[0-9a-f]{3,8}$/i.test(s[k])) out.push({ level: 'block', where, what: `colour "${String(s[k]).slice(0, 30)}" is not a #hex colour` });
    if (p?.glb) checkGlb(p.glb, where, out);
  }
  return { ok: !out.some((x) => x.level === 'block'), problems: out };
}

/** The report as lines of text. */
export const safetyReport = (r) => r.problems.map((p) => `${p.level === 'block' ? 'BLOCKED' : 'warning'}: ${p.where}: ${p.what}`);
