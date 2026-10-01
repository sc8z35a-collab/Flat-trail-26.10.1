// controls.js — Owner: E
// 美術館を「歩く」カメラ:
//  - スプライン上を実距離ベースの速度で歩行（加減速・歩行の上下動・視線の先読み）
//  - ドラッグで見回し（慣性付き）、ダブルタップ/ピンチで作品に寄る、フリックで前後移動
//  - キー/ホイール、ジャイロ微視差（横画面向き補正）
// 契約: createControls(camera, dom, museum) -> { update(dt,t), goTo(i), next(), prev(), onArrive(cb), onDepart(cb), index, moving, speed, wasDrag() }
import * as THREE from 'three';

const easeInOut = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
// 歩き出し/止まりが柔らかく、中盤は一定速度に近いブレンド
const smooth = (x) => { const a = easeInOut(x); const b = x; return a * 0.7 + b * 0.3; };
const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));

export function createControls(camera, dom, museum) {
  const { path, stops } = museum;
  const pathLen = path.getLength ? path.getLength() : 100;
  const BASE_FOV = camera.fov || 58;
  const WALK_SPEED = 2.1; // m/s 相当（ゆったりした鑑賞歩行より少し速い）
  const st = {
    index: 0, prev: 0, from: 0, to: 0, k: 1, dur: 2.4, moving: false,
    yaw: 0, pitch: 0, yawT: 0, pitchT: 0, yawV: 0, pitchV: 0,
    gyroX: 0, gyroY: 0, gx: 0, gy: 0,
    zoom: 0, zoomT: 0, bob: 0, travelled: 0, lastU: 0,
  };
  const arriveCbs = [], departCbs = [];
  const look = new THREE.Vector3(), lookA = new THREE.Vector3(), lookB = new THREE.Vector3(), lookS = new THREE.Vector3();
  const pos = new THREE.Vector3(), ahead = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), toLook = new THREE.Vector3();
  const qBase = new THREE.Quaternion(), qOff = new THREE.Quaternion(), eul = new THREE.Euler(0, 0, 0, 'YXZ');
  const mtx = new THREE.Matrix4();

  camera.position.copy(stops[0].pos); camera.lookAt(stops[0].look);
  lookS.copy(stops[0].look);

  const curT = () => st.moving ? THREE.MathUtils.lerp(st.from, st.to, smooth(Math.min(1, st.k))) : stops[st.index].t;

  function goTo(i) {
    i = Math.max(0, Math.min(stops.length - 1, i | 0));
    if (i === st.index && !st.moving) return false;
    st.from = curT();
    st.to = stops[i].t; st.k = 0; st.moving = true;
    const dist = Math.abs(st.to - st.from) * pathLen;
    st.dur = THREE.MathUtils.clamp(1.1 + dist / WALK_SPEED, 2.0, 7.5);
    st.prev = st.index; st.index = i;
    st.yawT = 0; st.pitchT = 0; st.yawV = 0; st.pitchV = 0; st.zoomT = 0;
    departCbs.forEach(cb => { try { cb(i); } catch (e) { console.error(e); } });
    return true;
  }

  // ---------- 入力 ----------
  const pointers = new Map();
  let down = null, lastTap = 0, pinch0 = 0, zoom0 = 0;
  const onDown = (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = st.zoomT; down = null; return;
    }
    down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), yaw: st.yawT, pitch: st.pitchT, moved: false, vx: 0, vy: 0, lt: performance.now() };
  };
  const onMove = (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch0 > 0) {
      const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      st.zoomT = THREE.MathUtils.clamp(zoom0 + (d / pinch0 - 1) * 0.6, 0, 0.55); return;
    }
    if (!down) return;
    const s = 1 / Math.max(320, Math.min(innerWidth, innerHeight)); // 画面サイズ非依存の感度
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (Math.abs(dx) + Math.abs(dy) > 8) down.moved = true;
    st.yawT = THREE.MathUtils.clamp(down.yaw - dx * s * 1.6, -1.25, 1.25);
    st.pitchT = THREE.MathUtils.clamp(down.pitch - dy * s * 1.1, -0.45, 0.5);
    const now = performance.now(), ddt = Math.max(1, now - down.lt);
    down.vx = (e.clientX - down.lx) / ddt; down.vy = (e.clientY - down.ly) / ddt; down.lx = e.clientX; down.ly = e.clientY; down.lt = now;
  };
  const onUp = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch0 = 0;
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y, dt = performance.now() - down.t;
    const s = 1 / Math.max(320, Math.min(innerWidth, innerHeight));
    if (dt < 380 && Math.abs(dx) > Math.max(60, innerWidth * 0.08) && Math.abs(dx) > Math.abs(dy) * 1.4) {
      st.yawT = down.yaw; st.pitchT = down.pitch; goTo(st.index + (dx < 0 ? 1 : -1)); // フリック = 移動
    } else if (down.moved) {
      // 慣性見回し
      st.yawV = -down.vx * s * 1.6 * 1000 * 0.12; st.pitchV = -down.vy * s * 1.1 * 1000 * 0.12;
    } else if (dt < 300) {
      const now = performance.now();
      if (now - lastTap < 320) { st.zoomT = st.zoomT > 0.2 ? 0 : 0.42; lastTap = 0; } // ダブルタップで寄る/戻る
      else lastTap = now;
    }
    down = null;
  };
  dom.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  dom.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (['ArrowRight', 'ArrowUp', 'd', 'w', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); goTo(st.index + 1); }
    if (['ArrowLeft', 'ArrowDown', 'a', 's', 'Backspace'].includes(e.key)) { e.preventDefault(); goTo(st.index - 1); }
    if (e.key === 'Home') goTo(0);
    if (e.key === 'End') goTo(stops.length - 1);
    if (e.key === 'z') st.zoomT = st.zoomT > 0.2 ? 0 : 0.42;
  });
  let wheelLock = 0, wheelAcc = 0;
  window.addEventListener('wheel', (e) => {
    const now = performance.now();
    if (e.ctrlKey) { st.zoomT = THREE.MathUtils.clamp(st.zoomT - e.deltaY * 0.003, 0, 0.55); return; }
    wheelAcc += e.deltaY; if (now < wheelLock || Math.abs(wheelAcc) < 40) return;
    wheelLock = now + 650; goTo(st.index + (wheelAcc > 0 ? 1 : -1)); wheelAcc = 0;
  }, { passive: true });
  window.addEventListener('deviceorientation', (e) => {
    if (e.beta == null || e.gamma == null) return;
    // 横画面: 画面の向き(90/-90)で軸が入れ替わる
    const ang = (screen.orientation?.angle ?? window.orientation ?? 90) | 0;
    const sgn = ang === -90 || ang === 270 ? -1 : 1;
    const lr = THREE.MathUtils.clamp((e.beta || 0) / 40, -1, 1) * sgn;      // 左右傾き
    const ud = THREE.MathUtils.clamp(((e.gamma || 0) * sgn + 50) / 40, -1, 1); // 前後傾き（構えた角度を基準）
    st.gyroX = -lr * 0.05; st.gyroY = ud * 0.03;
  });

  return {
    get index() { return st.index; },
    get moving() { return st.moving; },
    get speed() { return st.moving ? Math.sin(Math.PI * Math.min(1, st.k)) : 0; },
    get zoom() { return st.zoom; },
    goTo, next: () => goTo(st.index + 1), prev: () => goTo(st.index - 1),
    onArrive(cb) { arriveCbs.push(cb); }, onDepart(cb) { departCbs.push(cb); },
    wasDrag: () => !!down?.moved,
    update(dt, t = performance.now() / 1000) {
      dt = Math.min(dt, 0.1);
      let u;
      if (st.moving) {
        st.k += dt / st.dur;
        if (st.k >= 1) {
          st.k = 1; st.moving = false;
          arriveCbs.forEach(cb => { try { cb(st.index); } catch (e) { console.error(e); } });
        }
        u = THREE.MathUtils.lerp(st.from, st.to, smooth(Math.min(1, st.k)));
        // 視線: 出発→到着の注視点ブレンド＋移動中盤は進行方向を見る（頭を回して歩く）
        const e = easeInOut(Math.min(1, st.k));
        lookA.copy(stops[st.prev]?.look ?? stops[st.index].look); lookB.copy(stops[st.index].look);
        look.lerpVectors(lookA, lookB, THREE.MathUtils.smoothstep(e, 0.35, 0.95));
        const dir = Math.sign(st.to - st.from) || 1;
        path.getPointAt(THREE.MathUtils.clamp(u + dir * 0.035, 0, 1), ahead);
        ahead.y = 1.7;
        const mid = Math.sin(Math.PI * Math.min(1, st.k));
        look.lerp(ahead, Math.min(1, mid * 1.15) * 0.8);
      } else {
        u = stops[st.index].t;
        look.copy(stops[st.index].look);
      }
      u = THREE.MathUtils.clamp(u, 0, 1);
      path.getPointAt(u, pos);
      // 注視点は少し遅れて追従（首の動きの柔らかさ）
      if (lookS.distanceToSquared(look) > 400) lookS.copy(look);
      lookS.x = damp(lookS.x, look.x, 6, dt); lookS.y = damp(lookS.y, look.y, 6, dt); lookS.z = damp(lookS.z, look.z, 6, dt);

      // 歩行の上下動（移動距離に比例した位相）＋停止中の呼吸
      const du = Math.abs(u - st.lastU) * pathLen; st.lastU = u;
      st.travelled += du;
      const walkAmt = st.moving ? Math.min(1, Math.sin(Math.PI * Math.min(1, st.k)) * 1.6) : 0;
      st.bob = damp(st.bob, walkAmt, 4, dt);
      const phase = st.travelled * (Math.PI * 2 / 1.5); // 1歩 ≒ 0.75m
      pos.y += Math.abs(Math.sin(phase)) * 0.035 * st.bob - 0.017 * st.bob;
      pos.x += Math.sin(phase * 0.5) * 0.018 * st.bob;
      pos.y += Math.sin(t * 0.9) * 0.012 * (1 - st.bob);
      pos.x += Math.sin(t * 0.41) * 0.01 * (1 - st.bob);

      // 寄る（ズーム）: 注視点方向へドリー
      st.zoom = damp(st.zoom, st.moving ? 0 : st.zoomT, 3.5, dt);
      if (st.zoom > 1e-4) { toLook.subVectors(lookS, pos); pos.addScaledVector(toLook, st.zoom * 0.6); }
      camera.position.copy(pos);

      mtx.lookAt(pos, lookS, up); qBase.setFromRotationMatrix(mtx);
      // 慣性
      if (!down) {
        st.yawT = THREE.MathUtils.clamp(st.yawT + st.yawV * dt, -1.25, 1.25);
        st.pitchT = THREE.MathUtils.clamp(st.pitchT + st.pitchV * dt, -0.45, 0.5);
        st.yawV *= Math.exp(-5 * dt); st.pitchV *= Math.exp(-5 * dt);
        // 停止中は数秒かけてゆっくり作品へ視線が戻る
        if (!st.moving) { st.yawT = damp(st.yawT, 0, 0.35, dt); st.pitchT = damp(st.pitchT, 0, 0.35, dt); }
      }
      st.yaw = damp(st.yaw, st.yawT, 9, dt); st.pitch = damp(st.pitch, st.pitchT, 9, dt);
      st.gx = damp(st.gx, st.gyroX, 4, dt); st.gy = damp(st.gy, st.gyroY, 4, dt);
      // 歩行時のわずかなロール
      const roll = Math.sin(phase * 0.5) * 0.006 * st.bob;
      eul.set(st.pitch + st.gy, st.yaw + st.gx, roll); qOff.setFromEuler(eul);
      camera.quaternion.copy(qBase).multiply(qOff);
      // FOV: 歩行中はわずかに広く、寄ると狭く（望遠的に）
      const targetFov = BASE_FOV + st.bob * 3 - st.zoom * 10;
      if (Math.abs(targetFov - camera.fov) > 0.01) { camera.fov = damp(camera.fov, targetFov, 3, dt); camera.updateProjectionMatrix(); }
    },
  };
}
