// selftest.js — Owner: F  自動巡回テスト。site/selftest.html が index.html を iframe で開き、その window を検査する
// window.__FT が出来たら全ストップを順に goTo し、各到着で例外・NaN・描画統計を検査して console に出す。
// PlaywrightConsoleCapture で "[SELFTEST]" 行を見るだけで全展示の巡回結果が分かる。
const log = (...a) => console.log('[SELFTEST]', ...a);
const errs = [];
let W = window;
function hook(w) {
  w.addEventListener('error', e => errs.push(String(e.message || e)));
  w.addEventListener('unhandledrejection', e => errs.push('promise: ' + String(e.reason?.message || e.reason)));
  const ce = w.console.error.bind(w.console);
  w.console.error = (...a) => { errs.push('console.error: ' + a.map(String).join(' ').slice(0, 300)); ce(...a); };
}

function waitFT(ms = 60000) {
  return new Promise((res, rej) => {
    const t0 = performance.now();
    (function poll() {
      if (W.__FT?.controls && W.__FT?.museum) return res(W.__FT);
      if (performance.now() - t0 > ms) return rej(new Error('__FT not ready'));
      setTimeout(poll, 250);
    })();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function run({ win = window, dwell = 900 } = {}) {
  W = win; hook(W);
  const t0 = performance.now();
  let FT;
  try { FT = await waitFT(); } catch (e) { log('FAIL', e.message); return; }
  const { controls, museum, camera, renderer } = FT;
  const n = museum.stops?.length ?? museum.exhibits?.length ?? 0;
  log(`ready in ${((performance.now() - t0) / 1000).toFixed(1)}s, stops=${n}, exhibits=${museum.exhibits?.length}`);
  W.document.getElementById('btn-start')?.click();
  await sleep(2500);
  const bad = [];
  for (let i = 0; i < n; i++) {
    const e0 = errs.length;
    try { controls.goTo(i); } catch (e) { bad.push(`goTo(${i}) threw ${e.message}`); continue; }
    let w = 0; while (controls.moving && w < 8000) { await sleep(100); w += 100; }
    await sleep(dwell);
    const p = camera.position;
    if (![p.x, p.y, p.z].every(Number.isFinite)) bad.push(`stop ${i}: camera NaN`);
    if (w >= 8000) bad.push(`stop ${i}: arrive timeout`);
    if (errs.length > e0) bad.push(`stop ${i}: ${errs.slice(e0).join(' | ')}`);
    const r = renderer.info.render;
    log(`stop ${String(i).padStart(2, '0')} ok cam(${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}) calls=${r.calls} tris=${(r.triangles / 1000) | 0}k`);
  }
  const m = renderer.info.memory;
  log(`DONE ${bad.length ? 'FAIL' : 'PASS'} in ${((performance.now() - t0) / 1000).toFixed(1)}s textures=${m.textures} geometries=${m.geometries} programs=${renderer.info.programs?.length}`);
  bad.forEach(b => log('ISSUE', b));
}

