// Deze code draait in een aparte "werker" op de achtergrond, zodat de pagina
// niet vastloopt terwijl foto's worden omgezet.
//
// Wat hij doet, per foto:
//   1. De foto inlezen met de ingebouwde beeld-decoder van de browser.
//   2. Eventueel verkleinen.
//   3. Omzetten naar WebP met Google's libwebp (als WebAssembly).
//   4. Het resultaat teruggeven aan de pagina.
// Er gaat niets naar internet: dat verbiedt de beveiligingsregel (CSP) van de pagina.

const SIMD_TEST = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function loadEncoder() {
  // SIMD is een snellere variant die bijna alle moderne browsers ondersteunen.
  const simd = WebAssembly.validate(SIMD_TEST);
  const [factory, wasm] = simd
    ? await Promise.all([import('./vendor/webp/webp_enc_simd.js'), import('./vendor/webp/webp_enc_simd_wasm.js')])
    : await Promise.all([import('./vendor/webp/webp_enc.js'), import('./vendor/webp/webp_enc_wasm.js')]);
  // wasmBinary meegeven = de encoder hoeft niets op te halen.
  return factory.default({ noInitialRun: true, wasmBinary: base64ToBytes(wasm.default) });
}

const encoderReady = loadEncoder();
encoderReady.then(
  () => postMessage({ type: 'ready' }),
  (err) => postMessage({ type: 'fatal', error: String(err && err.message || err) }),
);

// Instellingen voor libwebp. Dit zijn de standaardwaarden uit libwebp,
// met kwaliteit/lossless van de gebruiker.
function webpOptions({ quality, lossless }) {
  return {
    quality, target_size: 0, target_PSNR: 0,
    method: 4, // 0 = snelst, 6 = kleinst. 4 is de gebruikelijke balans.
    sns_strength: 50, filter_strength: 60, filter_sharpness: 0, filter_type: 1,
    partitions: 0, segments: 4, pass: 1, show_compressed: 0, preprocessing: 0,
    autofilter: 0, partition_limit: 0, alpha_compression: 1, alpha_filtering: 1,
    alpha_quality: 100,
    lossless: lossless ? 1 : 0,
    exact: lossless ? 1 : 0, // bij lossless ook onzichtbare (transparante) pixels exact bewaren
    image_hint: 0, emulate_jpeg_size: 0, thread_level: 0, low_memory: 0,
    near_lossless: 100, use_delta_palette: 0,
    use_sharp_yuv: lossless ? 0 : 1, // scherpere kleurranden bij lossy, iets trager
  };
}

// Verkleint stap voor stap (steeds hooguit de helft) voor een scherper resultaat.
function drawScaled(bitmap, width, height) {
  let src = bitmap, w = bitmap.width, h = bitmap.height;
  while (w / 2 >= width && h / 2 >= height) {
    const nw = Math.round(w / 2), nh = Math.round(h / 2);
    const step = new OffscreenCanvas(nw, nh);
    const sctx = step.getContext('2d');
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(src, 0, 0, nw, nh);
    src = step; w = nw; h = nh;
  }
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

async function convert(file, opts) {
  let bitmap;
  try {
    // 'from-image' = draai de foto rechtop volgens de camera-informatie.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Je browser kan dit bestand niet als afbeelding lezen.');
  }
  let { width, height } = bitmap;
  const longest = Math.max(width, height);
  if (opts.maxSize && longest > opts.maxSize) {
    const scale = opts.maxSize / longest;
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }
  const imageData = drawScaled(bitmap, width, height);
  bitmap.close();

  const encoder = await encoderReady;
  const result = encoder.encode(imageData.data, width, height, webpOptions(opts));
  if (!result) throw new Error('Omzetten naar WebP is mislukt.');
  // Kopie maken: het origineel leeft in het geheugen van de encoder.
  const buffer = result.slice().buffer;
  return { buffer, width, height };
}

self.onmessage = async ({ data }) => {
  const { id, file, opts } = data;
  try {
    const { buffer, width, height } = await convert(file, opts);
    postMessage({ type: 'done', id, buffer, width, height }, [buffer]);
  } catch (err) {
    postMessage({ type: 'error', id, error: String(err && err.message || err) });
  }
};
