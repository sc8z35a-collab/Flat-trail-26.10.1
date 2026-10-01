// controls.js — Owner: E
// スプライン上のシネマティック移動（easeInOut）+ ドラッグ見回し + スワイプ/キー/ホイールでの前後移動 + ジャイロ微視差
import * as THREE from 'three';

const ease = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

export function createControls(camera, dom, museum) {
  const { path, stops } = museum;
  const st = {
    index: 0, from: 0, to: 0, k: 1, dur: 2.4, moving: false,
    yaw: 0, pitch: 0, yawT: 0, pitchT: 0, gyroX: 0, gyroY: 0,
  };
  const arriveCbs = [], departCbs = [];
  const look = new THREE.Vector3(), lookA = new THREE.Vector3(), lookB = new THREE.Vector3();
  const pos = new THREE.Vector3(), tmp = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const qBase = new THREE.Quaternion(), qOff = new THREE.Quaternion(), eul = new THREE.Euler(0, 0, 0, 'YXZ');
  const mtx = new THREE.Matrix4();

  camera.position.copy(stops[0].pos); camera.lookAt(stops[0].look);

  function goTo(i) {
    i = Math.max(0, Math.min(stops.length - 1, i));
    if (i === st.index && !st.moving) return false;
    st.from = st.moving ? lerpT() : stops[st.index].t;
    st.to = stops[i].t; st.k = 0; st.moving = true;
    st.dur = THREE.MathUtils.clamp(1.4 + Math.abs(i - st.index) * 0.6, 1.6, 4.5);
    st.prev = st.index; st.index = i;
    st.yawT = 0; st.pitchT = 0;
    departCbs.forEach(cb => cb(i));
    return true;
  }
  const lerpT = () => THREE.MathUtils.lerp(st.from, st.to, ease(Math.min(1, st.k)));

  // ---- 入力 ----
  let down = null;
  dom.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now(), yaw: st.yawT, pitch: st.pitchT, moved: false }; });
  window.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) down.moved = true;
    st.yawT = THREE.MathUtils.clamp(down.yaw - dx * 0.004, -1.2, 1.2);
    st.pitchT = THREE.MathUtils.clamp(down.pitch - dy * 0.003, -0.5, 0.5);
  });
  window.addEventListener('pointerup', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x, dt = performance.now() - down.t;
    if (dt < 350 && Math.abs(dx) > 70) { // フリック = 移動
      st.yawT = down.yaw; goTo(st.index + (dx < 0 ? 1 : -1));
    }
    down = null;
  });
  window.addEventListener('keydown', (e) => {
    if (['ArrowRight', 'ArrowUp', 'd', 'w', ' '].includes(e.key)) goTo(st.index + 1);
    if (['ArrowLeft', 'ArrowDown', 'a', 's'].includes(e.key)) goTo(st.index - 1);
  });
  let wheelLock = 0;
  window.addEventListener('wheel', (e) => {
    const now = performance.now(); if (now < wheelLock) return; wheelLock = now + 700;
    goTo(st.index + (e.deltaY > 0 ? 1 : -1));
  }, { passive: true });
  window.addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    // 横画面: beta が左右、gamma が上下
    st.gyroX = THREE.MathUtils.clamp((e.beta || 0) / 90, -1, 1) * 0.06;
    st.gyroY = THREE.MathUtils.clamp(((e.gamma || 0) + 45) / 90, -1, 1) * 0.04;
  });

  return {
    get index() { return st.index; },
    get moving() { return st.moving; },
    get speed() { return st.moving ? Math.sin(Math.PI * Math.min(1, st.k)) : 0; },
    goTo, next: () => goTo(st.index + 1), prev: () => goTo(st.index - 1),
    onArrive(cb) { arriveCbs.push(cb); }, onDepart(cb) { departCbs.push(cb); },
    wasDrag: () => down?.moved,
    update(dt, t) {
      let u;
      if (st.moving) {
        st.k += dt / st.dur;
        if (st.k >= 1) { st.k = 1; st.moving = false; arriveCbs.forEach(cb => cb(st.index)); }
        u = lerpT();
        // 視線: 出発地と到着地の注視点をブレンドしつつ、移動中は進行方向を向く
        const e = ease(Math.min(1, st.k));
        lookA.copy(stops[st.prev].look); lookB.copy(stops[st.index].look);
        look.lerpVectors(lookA, lookB, e);
        path.getPointAt(Math.min(1, u + 0.02 * Math.sign(st.to - st.from + 1e-6)), tmp);
        tmp.y = 1.9;
        const mid = Math.sin(Math.PI * e);
        look.lerp(tmp, mid * 0.75);
      } else {
        u = st.to;
        look.copy(stops[st.index].look);
      }
      path.getPointAt(THREE.MathUtils.clamp(u, 0, 1), pos);
      // 呼吸のような微小揺れ
      pos.y += Math.sin(t * 0.8) * 0.025;
      pos.x += Math.sin(t * 0.37) * 0.02;
      camera.position.copy(pos);
      mtx.lookAt(pos, look, up); qBase.setFromRotationMatrix(mtx);
      st.yaw += (st.yawT - st.yaw) * Math.min(1, dt * 5);
      st.pitch += (st.pitchT - st.pitch) * Math.min(1, dt * 5);
      if (!down && !st.moving) { st.yawT *= 1 - Math.min(1, dt * 0.25); st.pitchT *= 1 - Math.min(1, dt * 0.25); }
      eul.set(st.pitch + st.gyroY, st.yaw + st.gyroX, 0); qOff.setFromEuler(eul);
      camera.quaternion.copy(qBase).multiply(qOff);
      // 移動中はFOVを広げて速度感
      const targetFov = 62 + (st.moving ? Math.sin(Math.PI * Math.min(1, st.k)) * 14 : 0);
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
    },
  };
}
