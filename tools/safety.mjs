// The library safety checker. One file, used in three places:
//   - the app, before installing any library (and before publishing yours)
//   - tools/check.mjs, on every pull request to the library list (GitHub Actions)
//   - tools/pack.mjs, before a library is packed into the list
// It reads the library as text and data, never runs it. "block" problems stop it (no install, no
// publish, the pull request check fails); "warn" ones are shown to whoever installs or reviews it.
//
// What it guards against: library code reaching the network, files or the app (it runs sealed off
// anyway: this is the second wall), code hidden from review (obfuscation, code built at run time),
// 3D models that fetch things from the internet, oversized files, and markup in names. Parts that
// move, make sounds or add controls must stay within the app's limits (the app enforces them
// while running too), and whoever installs one is told what it can do.

const LIMITS = {
  fileBytes: 40 * 1024 * 1024, // a whole .benchlib
  glbBytes: 30 * 1024 * 1024, // one 3D model
  codeBytes: 300 * 1024, // device + sketch code
  parts: 100,
  pinsPerPart: 600,
  lineLength: 1000,
  // what one part may do (the same numbers as LIB_LIMITS in the app's src/lib/format.ts)
  movingPerPart: 8,
  torque: 300, // kg*cm
  force: 2000, // N
  rpm: 30000,
  slideSpeed: 500, // cm/s
  travel: 100, // cm
  controls: 32,
  keys: 64,
  rangers: 4,
  range: 1000, // cm
  touches: 8,
  lights: 4,
  screenPixels: 320 * 320,
};
const NEW_FEATURES_APP = '0.3.0'; // the first app with moving parts, sounds, controls, distance sensors, messages
const SENSING_APP = '0.4.0'; // the first with motion, touch, light, hearing, SPI chips and colour screens
const older = (a, b) => {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0);
  return false;
};
const num = (x) => typeof x === 'number' && Number.isFinite(x);

/** Moving pieces, controls, sounds, distance sensors: within the limits, and said out loud. */
function checkAbilities(p, where, out) {
  const L = LIMITS;
  const moving = p?.moving ?? [];
  if (!Array.isArray(moving)) return out.push({ level: 'block', where, what: 'its moving pieces are not a list' });
  if (moving.length > L.movingPerPart) out.push({ level: 'block', where, what: `${moving.length} moving pieces (most is ${L.movingPerPart})` });
  for (const m of moving) {
    const j = m?.joint ?? {};
    const w = `${where}, moving piece ${m?.id}`;
    if (!num(m?.mass) || m.mass < 0.5 || m.mass > 100000) out.push({ level: 'block', where: w, what: 'must weigh 0.5 g to 100 kg' });
    for (const k of ['torque', 'force', 'speed', 'volts', 'min', 'max']) if (j[k] !== undefined && !num(j[k])) out.push({ level: 'block', where: w, what: `joint.${k} is not a number` });
    const slide = j.type === 'slide';
    if ((j.torque ?? 0) > L.torque || (j.torque ?? 0) < 0) out.push({ level: 'block', where: w, what: `torque ${j.torque} kg*cm (most is ${L.torque})` });
    if ((j.force ?? 0) > L.force || (j.force ?? 0) < 0) out.push({ level: 'block', where: w, what: `force ${j.force} N (most is ${L.force})` });
    if ((j.speed ?? 0) > (slide ? L.slideSpeed : L.rpm) || (j.speed ?? 0) < 0) out.push({ level: 'block', where: w, what: `speed ${j.speed} ${slide ? 'cm/s' : 'rpm'} (most is ${slide ? L.slideSpeed : L.rpm})` });
    if (slide && (Math.abs(j.min ?? 0) > L.travel || Math.abs(j.max ?? 0) > L.travel)) out.push({ level: 'block', where: w, what: `travel more than ${L.travel} cm` });
  }
  if (moving.length) out.push({ level: 'warn', where, what: `moves: ${moving.map((m) => `${m?.id} (${m?.joint?.motor ?? 'free'}${m?.joint?.motor && m.joint.motor !== 'free' ? `, ${m.joint.type === 'slide' ? `${m.joint.force ?? 10} N` : `${m.joint.torque ?? 1} kg*cm`}` : ''})`).join(', ')}` });
  const ctl = p?.controls ?? [];
  if (!Array.isArray(ctl) || ctl.length > L.controls) out.push({ level: 'block', where, what: `too many controls (most is ${L.controls})` });
  for (const c of Array.isArray(ctl) ? ctl : []) {
    if (typeof c?.label !== 'string' || c.label.length > 60 || MARKUP.test(c.label)) out.push({ level: 'block', where, what: `control ${c?.id}: its label must be plain text, 60 characters at most` });
    for (const k of c?.keys ?? []) if (typeof k !== 'string' || k.length > 12 || MARKUP.test(k)) out.push({ level: 'block', where, what: `control ${c?.id}: key labels must be short plain text` });
    if ((c?.keys?.length ?? 0) > L.keys) out.push({ level: 'block', where, what: `control ${c?.id}: ${c.keys.length} keys (most is ${L.keys})` });
  }
  const rangers = [...(p?.shape ?? []), ...moving.flatMap((m) => m?.shape ?? [])].filter((x) => x?.ranger);
  if (rangers.length > L.rangers) out.push({ level: 'block', where, what: `${rangers.length} distance sensors (most is ${L.rangers})` });
  for (const r of rangers) if (r.ranger.max !== undefined && !(num(r.ranger.max) && r.ranger.max > 0 && r.ranger.max <= L.range)) out.push({ level: 'block', where, what: `distance sensor ${r.ranger.id}: max must be 1 to ${L.range} cm` });
  if (p?.sound) out.push({ level: 'warn', where, what: 'makes sounds (tones only, volume-limited; the toolbar\'s Sound button mutes them)' });
  return moving.length || ctl.length || rangers.length || p?.sound;
}

// [pattern, why] for library code. Comments are stripped first, strings are kept (code hidden in a
// string still has to be turned into code, which is blocked below).
const BLOCKED_CODE = [
  [/\b(fetch|XMLHttpRequest|WebSocket|EventSource|WebTransport|sendBeacon)\b/, 'reaches the network'],
  [/\b(importScripts|require)\s*\(|\bimport\s*\(|^\s*import\s|^\s*export\s/m, 'loads other code'],
  [/\b(indexedDB|localStorage|sessionStorage|caches|cookieStore|document\.cookie)\b/, 'reaches stored data'],
  [/\b(SharedWorker|Worker|BroadcastChannel|MessageChannel|ServiceWorker)\b/, 'starts threads or channels of its own'],
  // (the worker's own postMessage / onmessage / addEventListener, called bare; a library's objects
  //  may have a method of that name, as Keypad.h does: obj.addEventListener(fn), or defining it)
  [/(?<![.\w$])(postMessage|onmessage|addEventListener)\b(?!\s*\([^)]*\)\s*\{)/, 'talks to the app behind its back (only bench.device is allowed)'],
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
 if (lib.needsApp !== undefined && !/^\d+\.\d+\.\d+$/.test(String(lib.needsApp))) out.push({ level: 'block', where: 'needsApp', what: 'is not a version like 0.2.1' });
  if (lib.owner !== undefined && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(String(lib.owner))) out.push({ level: 'block', where: 'owner', what: 'is not a GitHub account name' });
  if (lib.homepage && !/^https:\/\/[\w.-]+\//i.test(lib.homepage)) out.push({ level: 'warn', where: 'homepage', what: 'is not an https:// address' });
  const codeSize = (lib.code?.length ?? 0) + Object.values(lib.sketch ?? {}).reduce((s, f) => s + (f?.code?.length ?? 0), 0);
  if (codeSize > LIMITS.codeBytes) out.push({ level: 'block', where: 'code', what: `${Math.round(codeSize / 1024)} KB of code is more than can be reviewed (most is ${LIMITS.codeBytes / 1024} KB)` });
  checkCode(lib.code, 'device code', out, true);
  for (const [name, f] of Object.entries(lib.sketch ?? {})) {
    if (!/^[\w.+-]+\.(h|hpp)$/.test(name)) out.push({ level: 'block', where: `sketch ${name}`, what: 'its name must look like Name.h (or Name.hpp)' });
    for (const c of [...(f?.classes ?? []), ...(f?.exports ?? [])]) if (!/^[A-Za-z_]\w*$/.test(c)) out.push({ level: 'block', where: `sketch ${name}`, what: `"${c}" is not a name` });
    checkCode(f?.code, `sketch ${name}`, out, false);
  }
  for (const ex of Array.isArray(lib.examples) ? lib.examples : []) {
    for (const k of ['name', 'description']) if (typeof ex?.[k] === 'string' && MARKUP.test(ex[k])) out.push({ level: 'block', where: `example ${ex?.name}`, what: `its ${k} has web markup or script in it` });
    if (ex?.project?.format !== 'bench-workshop') out.push({ level: 'block', where: `example ${ex?.name}`, what: 'is not a bench project' });
    for (const p of ex?.project?.parts ?? []) if (typeof p?.name === 'string' && MARKUP.test(p.name)) out.push({ level: 'block', where: `example ${ex?.name}`, what: 'a part name has web markup in it' });
  }
  const parts = Array.isArray(lib.parts) ? lib.parts : [];
  if (parts.length > LIMITS.parts) out.push({ level: 'block', where: 'parts', what: `${parts.length} parts (most is ${LIMITS.parts})` });
  let newFeatures = /\b(motor|sound|control|ranger)\s*\(|\bio\s*\.\s*(send|pwm|connect|draw)\b|\bpackets\s*\(/.test(stripComments(lib.code ?? ''))
    || Object.values(lib.sketch ?? {}).some((f) => /\blink(Send|Receive)\b/.test(f?.code ?? ''));
  for (const p of parts) {
    const where = `part ${p?.id}`;
    if (checkAbilities(p, where, out)) newFeatures = true;
    for (const pin of p?.pins ?? []) if (pin?.on !== undefined && !(p.moving ?? []).some((m) => m?.id === pin.on)) out.push({ level: 'block', where, what: `pin ${pin?.id} is on "${pin.on}", which is no moving piece of it` });
    for (const k of ['name', 'description', 'category'])
      if (typeof p?.[k] === 'string' && MARKUP.test(p[k])) out.push({ level: 'block', where, what: `its ${k} has web markup or script in it` });
    const pins = (p?.pins?.length ?? 0) + (p?.pinRows ?? []).reduce((s, r) => s + (r?.ids?.length ?? 0), 0);
    if (pins > LIMITS.pinsPerPart) out.push({ level: 'block', where, what: `${pins} pins (most is ${LIMITS.pinsPerPart})` });
    if (!(p?.mass > 0 && p.mass < 1e6)) out.push({ level: 'warn', where, what: `weighs ${p?.mass} g` });
    for (const s of p?.shape ?? []) for (const k of ['color']) if (s?.[k] && !/^#[0-9a-f]{3,8}$/i.test(s[k])) out.push({ level: 'block', where, what: `colour "${String(s[k]).slice(0, 30)}" is not a #hex colour` });
    if (p?.glb) checkGlb(p.glb, where, out);
  }
  let sensing = /\bpart\s*\.\s*(motion|touch|light|hear)\s*\(|\bspi\s*:\s*\{|\.pixels\s*\(/.test(stripComments(lib.code ?? ''))
    || Object.values(lib.sketch ?? {}).some((f) => /\bSPI\s*\.|\bsetRef\b|\bisRef\b/.test(f?.code ?? ''));
  for (const p of parts) {
    const where = `part ${p?.id}`;
    const items = [...(p?.shape ?? []), ...(p?.moving ?? []).flatMap((m) => m?.shape ?? [])];
    const touches = items.filter((x) => x?.touch !== undefined), lights = items.filter((x) => x?.light);
    if (touches.length > LIMITS.touches) out.push({ level: 'block', where, what: `${touches.length} touch surfaces (most is ${LIMITS.touches})` });
    if (lights.length > LIMITS.lights) out.push({ level: 'block', where, what: `${lights.length} light sensors (most is ${LIMITS.lights})` });
    for (const sc of items.filter((x) => x?.screen?.mode === 'rgb'))
      if (!(sc.screen.px?.[0] * sc.screen.px?.[1] <= LIMITS.screenPixels)) out.push({ level: 'block', where, what: `screen ${sc.screen.id}: at most 320 x 320 pixels` });
    if (touches.length || lights.length || p?.spi || p?.hear || items.some((x) => x?.screen?.mode === 'rgb')) sensing = true;
    if (p?.hear) out.push({ level: 'warn', where, what: 'hears the sounds parts on the bench make (no real microphone)' });
  }
  if (sensing && (!lib.needsApp || older(lib.needsApp, SENSING_APP)))
    out.push({ level: 'block', where: 'needsApp', what: `it uses motion, touch, light, hearing, SPI or colour screens: set "needsApp": "${SENSING_APP}" (older apps can't run it)` });
  if (newFeatures && (!lib.needsApp || older(lib.needsApp, NEW_FEATURES_APP)))
    out.push({ level: 'block', where: 'needsApp', what: `it uses moving parts, sounds, controls, distance sensors or messages: set "needsApp": "${NEW_FEATURES_APP}" (older apps can't run it)` });
  return { ok: !out.some((x) => x.level === 'block'), problems: out };
}

/** The report as lines of text. */
export const safetyReport = (r) => r.problems.map((p) => `${p.level === 'block' ? 'BLOCKED' : 'warning'}: ${p.where}: ${p.what}`);
