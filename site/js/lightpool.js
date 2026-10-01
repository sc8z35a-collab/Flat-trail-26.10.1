// lightpool.js — Owner: B（任意利用のヘルパ。C/A が museum.js / main.js から使うかを判断）
// 展示ごとに SpotLight を作らず、影なし SpotLight を N 灯だけ持ち、カメラに近い展示へ毎フレーム割り当てる。
// 灯数は固定なのでシェーダ再コンパイルは発生しない。切替はフェードで行い、ポップを防ぐ。
//
// 使い方:
//   import { createLightPool } from './lightpool.js';
//   const pool = createLightPool(scene, museum.exhibits.map(e => e.mesh), { count: 3 });
//   loop: pool.update(dt, camera, focusIndex)   // focusIndex: 注視中の展示（-1可）は必ず照らす
import * as THREE from 'three';

export function createLightPool(scene, groups, { count = 3, intensity = 26, distance = 9, angle = 0.48, penumbra = 0.65, decay = 1.6 } = {}) {
  const lights = [];
  for (let i = 0; i < count; i++) {
    const l = new THREE.SpotLight(0xffe8c8, 0, distance, angle, penumbra, decay);
    l.castShadow = false; scene.add(l, l.target);
    lights.push({ l, owner: -1, level: 0 });
  }
  const wp = new THREE.Vector3(), tmp = new THREE.Vector3();
  const dists = groups.map(() => 0);
  const order = groups.map((_, i) => i);

  function place(slot, i) {
    const g = groups[i], ud = g.userData || {};
    g.updateWorldMatrix(true, false);
    slot.l.position.copy(ud.lightPos || tmp.set(0, 3.7, 2)).applyMatrix4(g.matrixWorld);
    slot.l.target.position.copy(ud.focus || tmp.set(0, 1.7, -0.5)).applyMatrix4(g.matrixWorld);
    slot.l.target.updateMatrixWorld();
    if (ud.lightColor) slot.l.color.copy(ud.lightColor);
    slot.owner = i;
  }

  return {
    lights: lights.map((s) => s.l),
    setIntensity(v) { intensity = v; },
    update(dt, camera, focusIndex = -1) {
      if (!camera || !groups.length) return;
      for (let i = 0; i < groups.length; i++) { groups[i].getWorldPosition(wp); dists[i] = wp.distanceToSquared(camera.position); }
      order.sort((a, b) => dists[a] - dists[b]);
      const want = order.slice(0, count);
      if (focusIndex >= 0 && !want.includes(focusIndex)) want[want.length - 1] = focusIndex;
      // 既に担当している灯はそのまま、外れた灯はフェードアウト後に付け替え
      const free = [];
      for (const s of lights) { if (!want.includes(s.owner)) free.push(s); }
      for (const i of want) {
        if (lights.some((s) => s.owner === i)) continue;
        const s = free.find((f) => f.level < 0.02) || null;
        if (s) { place(s, i); free.splice(free.indexOf(s), 1); }
      }
      const k = Math.min(1, dt * 3);
      for (const s of lights) {
        const on = want.includes(s.owner) ? 1 : 0;
        s.level += (on - s.level) * k;
        const boost = s.owner === focusIndex ? 1.25 : 1;
        s.l.intensity = intensity * s.level * boost;
        // visible は切り替えない（ライト数が変わるとシェーダ再コンパイルになるため）
      }
    },
    dispose() { lights.forEach((s) => { scene.remove(s.l, s.l.target); s.l.dispose?.(); }); },
  };
}
