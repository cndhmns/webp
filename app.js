// Hoofdcode van de pagina: foto's verzamelen, verdelen over achtergrond-werkers,
// resultaten tonen en downloaden. Er wordt niets naar internet gestuurd.
import { createZip } from './zip.js';

const $ = (sel) => document.querySelector(sel);
const el = {
  status: $('#engine-status'),
  quality: $('#quality'),
  qualityValue: $('#quality-value'),
  lossless: $('#lossless'),
  maxSize: $('#max-size'),
  dropzone: $('#dropzone'),
  pickFiles: $('#pick-files'),
  pickFolder: $('#pick-folder'),
  results: $('#results'),
  summary: $('#summary-text'),
  list: $('#file-list'),
  zip: $('#download-zip'),
  clear: $('#clear'),
  reconvert: $('#reconvert'),
};

const IMAGE_EXT = /\.(jpe?g|jfif|png|gif|bmp|webp|avif|heic|heif|tiff?)$/i;
const nf1 = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 });

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${nf0.format(n / 1024)} kB`;
  return `${nf1.format(n / 1024 / 1024)} MB`;
}

// ---------- Achtergrond-werkers ----------
// De werker wordt via een klein "blob"-bestandje gestart. Daardoor geldt het
// beveiligingsslot (CSP) van deze pagina ook binnen de werker.
function startWorker() {
  const workerUrl = new URL('worker.js', location.href).href;
  const boot = new Blob([`import ${JSON.stringify(workerUrl)};`], { type: 'text/javascript' });
  const bootUrl = URL.createObjectURL(boot);
  const w = new Worker(bootUrl, { type: 'module' });
  // Pas vrijgeven als de werker echt draait (sommige browsers laden de blob iets later).
  w.addEventListener('message', () => URL.revokeObjectURL(bootUrl), { once: true });
  return w;
}

const WORKER_COUNT = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
const workers = [];
let readyCount = 0;
let fatal = null;

for (let i = 0; i < WORKER_COUNT; i++) {
  const w = startWorker();
  const slot = { worker: w, ready: false, busy: null };
  w.onmessage = ({ data }) => onWorkerMessage(slot, data);
  w.onerror = (e) => {
    e.preventDefault();
    fatal = 'De encoder kon niet starten. Gebruik een recente versie van Chrome, Edge, Firefox of Safari.';
    updateEngineStatus();
  };
  workers.push(slot);
}

function updateEngineStatus() {
  if (fatal) {
    el.status.textContent = fatal;
    el.status.className = 'status bad';
  } else if (readyCount === WORKER_COUNT) {
    el.status.textContent = 'Klaar voor gebruik. Alles is geladen: je kunt nu zelfs je internet uitzetten.';
    el.status.className = 'status ok';
  }
}

// ---------- Lijst met foto's ----------
let nextId = 1;
let nextJob = 1;
const items = []; // { id, file, path, status, job, blob, url, width, height, error, li }

function currentOptions() {
  return {
    quality: Number(el.quality.value),
    lossless: el.lossless.checked,
    maxSize: Number(el.maxSize.value),
  };
}

function addFiles(entries) {
  // entries: [{ file, path }]
  const fresh = entries.filter(({ file }) => file.type.startsWith('image/') || IMAGE_EXT.test(file.name));
  const skipped = entries.length - fresh.length;
  const added = [];
  for (const { file, path } of fresh) {
    const item = { id: nextId++, file, path, status: 'wachten', job: 0 };
    item.li = renderItem(item);
    el.list.append(item.li);
    items.push(item);
    added.push(item);
  }
  if (skipped) console.info(`${skipped} bestand(en) overgeslagen: geen afbeelding.`);
  el.results.hidden = items.length === 0;
  queueAll(added);
}

function queueAll(list) {
  const opts = currentOptions();
  for (const item of list) {
    item.status = 'wachten';
    item.opts = opts;
    item.job = nextJob++;
    updateItem(item);
  }
  pump();
  updateSummary();
}

function pump() {
  for (const slot of workers) {
    if (!slot.ready || slot.busy) continue;
    const item = items.find((i) => i.status === 'wachten');
    if (!item) return;
    item.status = 'bezig';
    slot.busy = { id: item.id, job: item.job };
    slot.worker.postMessage({ id: item.id, file: item.file, opts: item.opts });
    updateItem(item);
  }
}

function onWorkerMessage(slot, data) {
  if (data.type === 'ready') {
    slot.ready = true;
    readyCount++;
    updateEngineStatus();
    pump();
    return;
  }
  if (data.type === 'fatal') {
    fatal = `De encoder kon niet starten: ${data.error}`;
    updateEngineStatus();
    return;
  }

  const job = slot.busy;
  slot.busy = null;
  const item = items.find((i) => i.id === data.id);
  // Resultaat van een verouderde opdracht (lijst geleegd of opnieuw gestart)? Negeren.
  if (item && job && item.job === job.job) {
    if (data.type === 'done') {
      if (item.url) URL.revokeObjectURL(item.url);
      item.blob = new Blob([data.buffer], { type: 'image/webp' });
      item.url = URL.createObjectURL(item.blob);
      item.width = data.width;
      item.height = data.height;
      item.status = 'klaar';
    } else {
      item.status = 'fout';
      item.error = /\.(heic|heif)$/i.test(item.file.name)
        ? 'HEIC (iPhone-formaat) kan deze browser niet lezen. Probeer Safari, of zet op je iPhone Camera › Formaten op “Meest compatibel”.'
        : data.error;
    }
    updateItem(item);
    updateSummary();
  }
  pump();
}

function webpName(path) {
  return path.replace(/\.[^./\\]+$/, '') + '.webp';
}

function renderItem(item) {
  const li = document.createElement('li');
  li.className = 'file';
  li.innerHTML = `
    <img class="thumb" alt="">
    <div class="info"><div class="name"></div><div class="meta"></div></div>
    <a class="button" hidden>Download</a>`;
  li.querySelector('.name').textContent = item.path;
  li.querySelector('.name').title = item.path;
  return li;
}

function updateItem(item) {
  const meta = item.li.querySelector('.meta');
  const link = item.li.querySelector('a');
  const img = item.li.querySelector('img');
  const orig = formatBytes(item.file.size);
  meta.replaceChildren();

  if (item.status === 'klaar') {
    const diff = 1 - item.blob.size / item.file.size;
    meta.append(`${orig} → ${formatBytes(item.blob.size)} · ${item.width}×${item.height} · `);
    const span = document.createElement('span');
    if (diff >= 0) {
      span.className = 'saving';
      span.textContent = `−${nf0.format(diff * 100)}%`;
    } else {
      span.className = 'bigger';
      span.textContent = `+${nf0.format(-diff * 100)}% groter dan het origineel`;
    }
    meta.append(span);
    img.src = item.url;
    link.href = item.url;
    link.download = webpName(item.file.name);
    link.hidden = false;
  } else if (item.status === 'fout') {
    const span = document.createElement('span');
    span.className = 'error';
    span.textContent = `Mislukt: ${item.error}`;
    meta.append(span);
    link.hidden = true;
  } else {
    meta.append(`${orig} · ${item.status === 'bezig' ? 'bezig met omzetten…' : 'wacht op zijn beurt'}`);
    link.hidden = true;
  }
}

function updateSummary() {
  const done = items.filter((i) => i.status === 'klaar');
  const failed = items.filter((i) => i.status === 'fout').length;
  const before = done.reduce((s, i) => s + i.file.size, 0);
  const after = done.reduce((s, i) => s + i.blob.size, 0);
  let text = `${done.length} van ${items.length} klaar`;
  if (done.length) {
    const pct = before ? Math.round((1 - after / before) * 100) : 0;
    text += ` · ${formatBytes(before)} → ${formatBytes(after)} (${pct >= 0 ? '−' : '+'}${Math.abs(pct)}%)`;
  }
  if (failed) text += ` · ${failed} mislukt`;
  el.summary.textContent = text;
  el.zip.disabled = done.length === 0;
}

function clearAll() {
  for (const item of items) {
    if (item.url) URL.revokeObjectURL(item.url);
  }
  items.length = 0;
  el.list.replaceChildren();
  el.results.hidden = true;
  el.pickFiles.value = '';
  el.pickFolder.value = '';
}

async function downloadZip() {
  const done = items.filter((i) => i.status === 'klaar');
  if (!done.length) return;
  el.zip.disabled = true;
  const label = el.zip.textContent;
  el.zip.textContent = 'Zip maken…';
  try {
    const used = new Set();
    const entries = [];
    for (const item of done) {
      let name = webpName(item.path);
      // Dubbele namen (bijv. foto.jpg en foto.png) een nummer geven.
      for (let n = 2; used.has(name.toLowerCase()); n++) name = webpName(item.path).replace(/\.webp$/, `-${n}.webp`);
      used.add(name.toLowerCase());
      entries.push({ name, data: new Uint8Array(await item.blob.arrayBuffer()) });
    }
    const zip = createZip(entries);
    const url = URL.createObjectURL(zip);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'webp-fotos.zip';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    alert(err.message || String(err));
  } finally {
    el.zip.textContent = label;
    el.zip.disabled = false;
  }
}

// ---------- Bestanden binnenhalen (kiezen of slepen) ----------
function fromInput(input) {
  const list = [...input.files].map((file) => ({ file, path: file.webkitRelativePath || file.name }));
  input.value = '';
  addFiles(list);
}

function readAllEntries(reader) {
  return new Promise((resolve, reject) => {
    const all = [];
    const next = () => reader.readEntries((batch) => {
      if (!batch.length) return resolve(all);
      all.push(...batch);
      next();
    }, reject);
    next();
  });
}

async function walkEntry(entry, out) {
  if (entry.isFile) {
    const file = await new Promise((res, rej) => entry.file(res, rej));
    out.push({ file, path: entry.fullPath.replace(/^\//, '') });
  } else if (entry.isDirectory) {
    for (const child of await readAllEntries(entry.createReader())) await walkEntry(child, out);
  }
}

async function fromDrop(dataTransfer) {
  const out = [];
  const entries = [...dataTransfer.items]
    .map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null))
    .filter(Boolean);
  if (entries.length) {
    for (const entry of entries) await walkEntry(entry, out);
  } else {
    for (const file of dataTransfer.files) out.push({ file, path: file.name });
  }
  addFiles(out);
}

// ---------- Koppelingen ----------
el.quality.addEventListener('input', () => { el.qualityValue.textContent = el.quality.value; });
el.lossless.addEventListener('change', () => { el.quality.disabled = el.lossless.checked; });
el.pickFiles.addEventListener('change', () => fromInput(el.pickFiles));
el.pickFolder.addEventListener('change', () => fromInput(el.pickFolder));
el.clear.addEventListener('click', clearAll);
el.reconvert.addEventListener('click', () => queueAll(items));
el.zip.addEventListener('click', downloadZip);

// Slepen werkt op de hele pagina, zodat je niet precies hoeft te mikken.
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; el.dropzone.classList.add('over'); });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; el.dropzone.classList.remove('over'); } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  el.dropzone.classList.remove('over');
  if (e.dataTransfer) fromDrop(e.dataTransfer);
});
