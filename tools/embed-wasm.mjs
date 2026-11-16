// Zet de .wasm-bestanden om naar JavaScript-modules met de inhoud als base64-tekst.
//
// Waarom? De pagina verbiedt via de Content Security Policy (connect-src 'none')
// ALLE netwerkverzoeken vanuit de code. Daardoor mag de code het .wasm-bestand ook
// niet met fetch() ophalen. Door de wasm als gewone module in te laden omzeilen we
// dat zonder het slot open te zetten.
//
// Gebruik (alleen nodig als je de encoder bijwerkt):
//   node tools/embed-wasm.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

for (const name of ['webp_enc', 'webp_enc_simd']) {
  const wasm = readFileSync(new URL(`../vendor/webp/${name}.wasm`, import.meta.url));
  const sha = createHash('sha256').update(wasm).digest('hex');
  const out =
    `// Automatisch gegenereerd door tools/embed-wasm.mjs uit ${name}.wasm\n` +
    `// sha256 van het origineel: ${sha}\n` +
    `export default "${wasm.toString('base64')}";\n`;
  writeFileSync(new URL(`../vendor/webp/${name}_wasm.js`, import.meta.url), out);
  console.log(`${name}_wasm.js  (${wasm.length} bytes, sha256 ${sha})`);
}
