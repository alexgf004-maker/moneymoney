// Ningún emoji dentro del código (rompió módulos en producción en otro proyecto del usuario).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{FF0B}]/u;

function archivos(dir) {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : /\.(js|gs|html|css)$/.test(n) ? [p] : [];
  });
}

test('sin emojis en js/, apps-script/, css/ e index.html', () => {
  const malos = [...archivos('js'), ...archivos('apps-script'), 'index.html', 'css/styles.css']
    .flatMap(f => readFileSync(f, 'utf8').split('\n').map((l, i) => (EMOJI.test(l) ? `${f}:${i + 1}` : null)).filter(Boolean));
  assert.deepEqual(malos, []);
});
