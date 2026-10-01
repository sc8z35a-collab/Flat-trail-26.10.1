// perf.js — Owner: F
// 動的画質制御: FPSの移動平均を監視し high → mid → low を自動切替（ヒステリシス付き）
export function createPerf(renderer, { initial } = {}) {
  const levels = ['low', 'mid', 'high'];
  const prMax = { low: 1.0, mid: 1.35, high: 1.75 };
  const isMobile = matchMedia('(pointer:coarse)').matches;
  let idx = levels.indexOf(initial || (isMobile ? 'mid' : 'high'));
  if (new URLSearchParams(location.search).has('q')) idx = Math.max(0, levels.indexOf(new URLSearchParams(location.search).get('q')));
  const cbs = [];
  let acc = 0, frames = 0, cooldown = 3, lowCount = 0, highCount = 0;

  const apply = () => {
    const q = levels[idx];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, prMax[q]));
    cbs.forEach(cb => cb(q));
  };

  return {
    get quality() { return levels[idx]; },
    onChange(cb) { cbs.push(cb); },
    apply,
    tick(dt) {
      if (dt > 0.5) return; // タブ復帰時などの外れ値は無視
      acc += dt; frames++; cooldown -= dt;
      if (acc < 1) return;
      const fps = frames / acc; acc = 0; frames = 0;
      if (cooldown > 0) return;
      if (fps < 42) { lowCount++; highCount = 0; } else if (fps > 58) { highCount++; lowCount = 0; } else { lowCount = highCount = 0; }
      if (lowCount >= 2 && idx > 0) { idx--; lowCount = 0; cooldown = 4; apply(); }
      else if (highCount >= 6 && idx < 2) { idx++; highCount = 0; cooldown = 6; apply(); }
    },
  };
}
