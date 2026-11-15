// Locates many hadith at once and writes each witness pair to <outDir>/<collection>-<n>.txt
//   node content/deen/adhkar/tools/batch-locate.mjs <outDir> bukhari:6306 muslim:2723 ...
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { apiHadith, shamelaHadith } from './witness.mjs';

const [out, ...refs] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
for (const r of refs) {
  const [c, n] = r.split(':');
  let s = null;
  let a = null;
  try { s = await shamelaHadith(c, Number(n)); } catch (e) { s = { url: String(e), text: '' }; }
  try { a = await apiHadith(c, Number(n)); } catch (e) { a = { ref: String(e), text: '' }; }
  writeFileSync(join(out, `${c}-${n}.txt`), `--- SHAMELA ${s?.url ?? '(none)'} pages ${s?.pages?.join(',') ?? ''}\n${s?.text ?? ''}\n--- API ${a?.ref ?? '(none)'}\n${a?.text ?? ''}\n`);
  console.log(r, s?.text ? 'shamela ok' : 'shamela MISSING', a?.text ? 'api ok' : 'api MISSING');
}
