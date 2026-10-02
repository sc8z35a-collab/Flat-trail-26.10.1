// world.js — Owner: A。ゾーン（外観→ロビー→クーポラ→展示室→システィーナ）を数珠つなぎに合成する。
// 契約は collab/INTERFACES.md §2/§4/§6。各ゾーンはローカル座標で作り、ここで exit→entry を連結する。
// ゾーンのモジュールが無い/例外のときはプレースホルダで代替し、全体は止めない（並行開発での破損防止）。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// 巡回順。mod はゾーンのモジュール、fallback は無い時の代替。
export const ZONE_ORDER = [
  { id: 'exterior', mod: './exterior_d.js', owner: 'D', title: 'THE HILL BY THE SEA', sub: '海沿いの丘の美術館' },
  { id: 'lobby', mod: './lobby_a.js', owner: 'A', title: 'GLASS ATRIUM', sub: '光のアトリウム' },
  { id: 'cupola', mod: './museum_c_cupola.js', owner: 'C', title: 'CUPOLA HALL', sub: 'クーポラの間' },
  { id: 'gallery', mod: './museum_c_gallery.js', owner: 'C', title: 'THE GALLERIES', sub: '展示室 I – VI' },
  { id: 'sistine', mod: './museum_c_sistine.js', owner: 'C', title: 'THE CHAPEL', sub: '礼拝堂' },
];

// ---------------- 共有ライト rig（固定数: シェーダ再コンパイルを起こさない） ----------------
function createRig(scene) {
  const g = new THREE.Group(); g.name = 'rig'; scene.add(g);
  const sun = new THREE.DirectionalLight(0xfff1dc, 0); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 0.5, far: 200 });
  const hemi = new THREE.HemisphereLight(0xfff6ea, 0xb9ad9a, 0.4);
  const ambient = new THREE.AmbientLight(0xffffff, 0);
  g.add(sun, sun.target, hemi, ambient);
  const spots = [0, 1, 2, 3].map(() => { const L = new THREE.SpotLight(0xffe8c8, 0, 14, 0.5, 0.5, 1.5); g.add(L, L.target); return L; });
  const points = [0, 1, 2, 3].map(() => { const L = new THREE.PointLight(0xffe2b8, 0, 12, 1.6); g.add(L); return L; });
  const rig = {
    group: g, sun, hemi, ambient, spots, points,
    reset() {
      sun.intensity = 0; sun.color.set(0xfff1dc); sun.position.set(20, 40, 10); sun.target.position.set(0, 0, 0); sun.target.updateMatrixWorld();
      hemi.intensity = 0.4; hemi.color.set(0xfff6ea); hemi.groundColor.set(0xb9ad9a);
      ambient.intensity = 0; ambient.color.set(0xffffff);
      spots.forEach((L) => { L.intensity = 0; L.color.set(0xffe8c8); L.distance = 14; L.angle = 0.5; L.penumbra = 0.5; });
      points.forEach((L) => { L.intensity = 0; L.color.set(0xffe2b8); L.distance = 12; });
    },
  };
  rig.reset();
  return rig;
}

// ---------------- プレースホルダ（未作成ゾーンの代替） ----------------
function label(text, sub, w = 1024, h = 512) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = '#ece6da'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#3b352e'; g.textAlign = 'center'; g.font = '500 88px "Cormorant Garamond", serif'; g.fillText(text, w / 2, h * 0.45);
  g.fillStyle = '#7d6c55'; g.font = '400 40px "Noto Serif JP", serif'; g.fillText(sub, w / 2, h * 0.65);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function placeholderRoom(spec, { L = 24, W = 14, H = 8, color = 0xe8e2d6, kind = 'view' } = {}) {
  const group = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.BackSide });
  const box = new THREE.Mesh(new THREE.BoxGeometry(W, H, L), m); box.position.set(0, H / 2, -L / 2); box.receiveShadow = true; group.add(box);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({ map: label(spec.title, `${spec.sub} — 制作中 (${spec.owner})`) }));
  sign.position.set(0, 3.2, -L + 0.05); group.add(sign);
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  return {
    id: spec.id, group, placeholder: true, entry: { pos: v(0, 0, 0) }, exit: { pos: v(0, 0, -L), rotY: 0 },
    waypoints: [
      { pos: v(0, 1.65, -1.5) },
      { pos: v(0, 1.65, -L * 0.45), look: v(0, 3, -L), stop: { kind, title: spec.title, sub: spec.sub } },
      { pos: v(0, 1.65, -L + 1.5) },
    ],
    env: { background: 0xcfc8bd, fog: { color: 0xd9d3c9, density: 0.01 }, exposure: 1 },
    update(t, dt, s) { if (s.active) s.rig.hemi.intensity = 1.2; },
  };
}
function placeholderExterior(spec) {
  const group = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x3f6b33, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; group.add(ground);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2000, 1200), new THREE.MeshStandardMaterial({ color: 0x3fa7b0, roughness: 0.15 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(-700, -2, -200); group.add(sea);
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f1ec, roughness: 0.8 });
  [[-40, 50, 20, 14, -20], [45, 80, 22, 14, -30]].forEach(([x, l, w, h, z]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), white); b.position.set(x, h / 2, z); b.castShadow = b.receiveShadow = true; group.add(b); });
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  return {
    id: spec.id, group, placeholder: true, entry: { pos: v(0, 0, 0) }, exit: { pos: v(0, 0, 0), rotY: 0 },
    waypoints: [
      { pos: v(-60, 90, 160), look: v(0, 0, -20), stop: { kind: 'intro', title: spec.title, sub: spec.sub } },
      { pos: v(-10, 30, 60) },
      { pos: v(0, 1.7, 14) },
      { pos: v(0, 1.7, 3) },
    ],
    env: { background: 0xbcd6e8, fog: { color: 0xcfe0ea, density: 0.0016 }, exposure: 1, far: 3000 },
    update(t, dt, s) { if (s.active) { s.rig.sun.intensity = 2.5; s.rig.hemi.intensity = 0.8; } },
  };
}
// 展示室の代替: 旧 museum_f.js（動作する非ネオン回廊）を流用
async function fallbackGallery(spec, ctx) {
  const { buildMuseum } = await import('./museum_f.js');
  const tmpScene = new THREE.Group();
  const m = buildMuseum(tmpScene, ctx.NEWS, ctx.renderer);
  const group = new THREE.Group(); const root = m.root; group.add(root);
  const Z0 = 14; root.position.z = -Z0; root.updateMatrixWorld(true);
  root.traverse((o) => { if (o.isMesh && o.geometry?.type === 'PlaneGeometry' && Math.abs(o.position.z - Z0) < 0.01 && o.parent === root) o.visible = false; });
  const loc = (v) => v.clone().add(new THREE.Vector3(0, 0, -Z0));
  const stopByPos = new Map(m.stops.map((s) => [s.pos, s]));
  const waypoints = m.path.points.map((p) => {
    const s = stopByPos.get(p); const w = { pos: loc(p) };
    if (s?.kind === 'exhibit') { w.look = loc(s.look); w.stop = { kind: 'exhibit', index: s.index }; }
    else if (s?.kind === 'finale') { w.look = loc(s.look); w.stop = { kind: 'view', title: 'ATRIUM', sub: 'アトリウム' }; }
    return w;
  }).filter((w, i) => i > 0);
  const exhibits = m.exhibits.map((e) => ({ ...e, anchor: loc(e.anchor), viewPos: loc(e.viewPos) }));
  const camL = { position: new THREE.Vector3() };
  return {
    id: spec.id, group, placeholder: true, entry: { pos: new THREE.Vector3() }, exit: { pos: new THREE.Vector3(0, 0, m.endZ - Z0 + 2), rotY: 0 },
    waypoints, exhibits, skylights: m.skylights.map((s) => ({ ...s, z: s.z - Z0 })),
    env: { background: 0xcfc8bd, fog: { color: 0xd9d3c9, density: 0.010 }, exposure: 1 },
    update(t, dt, s) { camL.position.copy(s.camLocal).add(new THREE.Vector3(0, 0, Z0)); m.update(t, dt, s.focusIndex, camL); },
    setQuality: m.setQuality,
  };
}

// ---------------- 本体 ----------------
/**
 * @param ctx { renderer, scene, camera, NEWS, WINGS, PERIOD, assets, makeExhibit, quality, profile, progress, markShadow }
 * @param opts { only?: 'cupola' 等 — そのゾーンだけ作る（zone.html 用） }
 */
export async function buildWorld(ctx, opts = {}) {
  const { scene, renderer } = ctx;
  const rig = createRig(scene);
  const root = new THREE.Group(); root.name = 'world'; scene.add(root);
  const order = opts.only ? ZONE_ORDER.filter((z) => opts.only.split(',').includes(z.id)) : ZONE_ORDER;
  const zctx = { ...ctx, THREE, rig };

  // 既定の環境マップ（ゾーンが envMap を持たない間）
  const pmrem = new THREE.PMREMGenerator(renderer);
  const defaultEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = defaultEnv; scene.environmentIntensity = 0.6;

  // ---- 各ゾーンを構築 ----
  const zones = [];
  for (let k = 0; k < order.length; k++) {
    const spec = order[k];
    const p0 = k / order.length, p1 = (k + 1) / order.length;
    zctx.progress = (p, lbl) => ctx.progress?.(p0 + (p1 - p0) * Math.max(0, Math.min(1, p)), lbl || spec.title);
    zctx.progress(0, spec.title);
    let z = null;
    try {
      const mod = await import(spec.mod);
      z = await mod.buildZone(zctx);
      if (!z?.group || !z?.waypoints?.length) throw new Error('invalid zone object');
    } catch (e) {
      const missing = /Failed to fetch|404|Cannot find|error loading dynamically imported module|Importing a module script failed/i.test(String(e?.message || e));
      if (!missing) console.error(`[world] zone ${spec.id} failed → placeholder`, e);
      else console.info(`[world] zone ${spec.id} not yet available → placeholder`);
      try {
        z = spec.id === 'exterior' ? placeholderExterior(spec) : spec.id === 'gallery' ? await fallbackGallery(spec, zctx)
          : placeholderRoom(spec, spec.id === 'sistine' ? { L: 40, W: 13.4, H: 20, kind: 'finale' } : spec.id === 'cupola' ? { L: 22, W: 22, H: 18 } : { L: 40, W: 30, H: 20 });
      } catch (e2) { console.error('[world] fallback failed', e2); z = placeholderRoom(spec); }
    }
    z.id ??= spec.id; z.spec = spec;
    z.env ??= {}; z.entry ??= { pos: new THREE.Vector3() }; z.exit ??= { pos: new THREE.Vector3(0, 0, -20), rotY: 0 };
    zones.push(z);
    zctx.progress(1, spec.title);
    await new Promise((r) => requestAnimationFrame(r));
  }
  // 単体表示でゾーンが intro を持たない場合は最初の点を intro に
  // ---- 連結（exit → 次の entry）----
  const cur = new THREE.Vector3(), q = new THREE.Quaternion(), yAxis = new THREE.Vector3(0, 1, 0);
  let rotY = 0;
  for (const z of zones) {
    // entry がローカル原点でない場合も、entry が cur に来るように置く
    const e = z.entry.pos.clone().applyAxisAngle(yAxis, rotY);
    z.group.position.copy(cur).sub(e); z.group.rotation.y = rotY;
    root.add(z.group); z.group.updateMatrixWorld(true);
    const ex = z.group.localToWorld(z.exit.pos.clone());
    cur.copy(ex); rotY += z.exit.rotY || 0;
  }

  // ---- 経路（全ゾーンの waypoint をワールドへ）----
  const pts = [], tags = [];
  zones.forEach((z, zi) => {
    z.waypoints.forEach((w) => {
      const p = z.group.localToWorld(w.pos.clone());
      if (pts.length && pts[pts.length - 1].distanceTo(p) < 0.25) return; // 退化防止
      pts.push(p); tags.push({ zi, w, look: w.look ? z.group.localToWorld(w.look.clone()) : null });
    });
  });
  if (!tags.some((t) => t.w.stop?.kind === 'intro')) tags[0].w = { ...tags[0].w, stop: { kind: 'intro', title: zones[0].spec.title, sub: zones[0].spec.sub } };
  const path = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  const SEG = 24, DIV = (pts.length - 1) * SEG, lens = path.getLengths(DIV), total = lens[DIV];
  const tOf = (i) => lens[i * SEG] / total;
  const stops = [];
  const fwd = new THREE.Vector3();
  tags.forEach((tg, i) => {
    if (!tg.w.stop) return;
    let look = tg.look;
    if (!look) { // 未指定なら進行方向の少し先を見る
      const nxt = pts[Math.min(pts.length - 1, i + 1)], prv = pts[Math.max(0, i - 1)];
      fwd.subVectors(nxt, prv).normalize(); look = pts[i].clone().addScaledVector(fwd, 8);
    }
    stops.push({ ...tg.w.stop, t: tOf(i), pos: pts[i], look, zone: zones[tg.zi].id, zi: tg.zi });
  });
  // finale が無ければ最後の停止点を finale に
  if (!stops.some((s) => s.kind === 'finale')) stops[stops.length - 1].kind = 'finale';
  // ゾーンの経路範囲（t）
  zones.forEach((z, zi) => { const first = tags.findIndex((t) => t.zi === zi); z.t0 = first >= 0 ? tOf(first) : 1; });
  zones.forEach((z, zi) => { z.t1 = zones[zi + 1]?.t0 ?? 1; });

  // ---- 展示（gallery）をワールド座標で ----
  const exhibits = [];
  zones.forEach((z) => (z.exhibits || []).forEach((e) => {
    exhibits.push({ ...e, anchor: z.group.localToWorld(e.anchor.clone()), viewPos: z.group.localToWorld(e.viewPos.clone()), zone: z.id });
  }));
  // index でソート（NEWS の index と一致させる）
  const byIndex = []; exhibits.forEach((e) => { const i = ctx.NEWS.indexOf(e.news); byIndex[i >= 0 ? i : byIndex.length] = e; });
  const skylights = [];
  zones.forEach((z) => (z.skylights || []).forEach((s) => { const p = z.group.localToWorld(new THREE.Vector3(s.x, s.y, s.z)); skylights.push({ ...s, x: p.x, y: p.y, z: p.z }); }));

  // ---- 環境の切替・補間 ----
  const fog = new THREE.FogExp2(0xd9d3c9, 0.01); scene.fog = fog;
  const envState = { exposure: 1, fogC: new THREE.Color(0xd9d3c9), fogD: 0.01 };
  let active = -1;
  const bgColor = new THREE.Color();
  function applyEnv(z, camera) {
    const e = z.env;
    if (e.background?.isTexture) scene.background = e.background; else scene.background = bgColor.set(e.background ?? 0xcfc8bd);
    scene.environment = e.envMap || z._bakedEnv || defaultEnv;
    scene.environmentIntensity = e.envIntensity ?? 0.6;
    if (camera) { camera.near = e.near ?? 0.05; camera.far = e.far ?? 400; camera.updateProjectionMatrix(); }
    rig.reset(); ctx.markShadow?.(3);
  }
  const camLocal = new THREE.Vector3();
  const s = { camera: null, camLocal, active: false, focusIndex: -1, rig, quality: ctx.quality, zone: null };
  let bakeTimer = 0;
  const api = {
    zones, stops, path, exhibits: byIndex.filter(Boolean), skylights, rig, root,
    endZ: pts[pts.length - 1].z, hall: { width: 14, height: 8 },
    get activeZone() { return zones[active]; },
    zoneAt(u) { let k = 0; for (let i = 0; i < zones.length; i++) if (u >= zones[i].t0 - 1e-6) k = i; return k; },
    setQuality(qq, prof) { s.quality = qq; zones.forEach((z) => { try { z.setQuality?.(qq, prof); } catch (e) { console.error(e); } }); },
    /** u = カメラの経路パラメータ（controls.u）。focusIndex = 注視中の展示（NEWS index）*/
    update(t, dt, focusIndex, camera, u = 0) {
      const k = api.zoneAt(u);
      if (k !== active) {
        active = k; applyEnv(zones[k], camera); bakeTimer = 0;
        zones.forEach((z, i) => { z.group.visible = Math.abs(i - k) <= 1 || z.alwaysVisible; });
      }
      const z = zones[k], e = z.env;
      // 露出・霧を滑らかに
      const a = Math.min(1, dt * 1.5);
      envState.exposure += ((e.exposure ?? 1) - envState.exposure) * a; renderer.toneMappingExposure = envState.exposure;
      envState.fogC.lerp(bgColor.set(e.fog?.color ?? 0xd9d3c9), a); fog.color.copy(envState.fogC);
      envState.fogD += ((e.fog?.density ?? 0.01) - envState.fogD) * a; fog.density = envState.fogD;
      // 環境マップの自動焼き込み（envMap 未指定のゾーン、到着後少し待ってから1回）
      if (!e.envMap && !z._bakedEnv && !z.noBake && s.quality !== 'low' && (bakeTimer += dt) > 1.2) {
        try {
          const vis = zones.map((zz) => zz.group.visible); zones.forEach((zz, i) => { zz.group.visible = i === k; });
          const fogSave = scene.fog; scene.fog = null;
          z._bakedEnv = ctx.assets.bakeEnv(scene, camera.position, { size: 256, far: e.far ?? 400 });
          scene.fog = fogSave; zones.forEach((zz, i) => { zz.group.visible = vis[i]; });
          scene.environment = z._bakedEnv;
        } catch (err) { console.warn('[world] env bake failed', err); z.noBake = true; }
      }
      s.camera = camera; s.focusIndex = focusIndex; s.zone = z.id;
      for (let i = 0; i < zones.length; i++) {
        const zz = zones[i]; if (!zz.group.visible || !zz.update) continue;
        camLocal.copy(camera.position); zz.group.worldToLocal(camLocal);
        s.active = i === k;
        try { zz.update(t, dt, s); } catch (err) { if (!zz._warned) { console.error(`[world] ${zz.id}.update`, err); zz._warned = true; } }
      }
    },
  };
  return api;
}
