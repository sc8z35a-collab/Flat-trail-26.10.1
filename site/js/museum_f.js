// museum_f.js — Owner: F（museum.js(C) の暫定フォールバック。C が取り込み/破棄してよい）
// 非ネオンの現代美術館: トラバーチン床（PBR, 微反射）・白漆喰壁・オーク巾木・格天井と天窓（ライトウェル）・
// 展示室間の厚い間仕切りとポータル（室名を壁に刻字）・入口ロビー（真鍮切文字の館名）・終端アトリウム（大窓）。
// 照明: 太陽 DirectionalLight 1灯のみ影（カメラ近傍に影カメラを追従、更新は移動時のみ）＋ Hemisphere ＋
//       影なし SpotLight 3灯のライトプール（カメラ近傍の展示へ動的割当）＋ ダクトレール器具（見た目）。
// 契約（INTERFACES / main.js / controls.js / fx.js 準拠）:
//   buildMuseum(scene, NEWS, renderer) -> { root, exhibits:[{mesh,anchor,viewPos,news,side}], path, stops:[{kind,index?,t,pos,look}],
//                                         endZ, skylights:[{x,y,z,w,d}], hall:{width,height}, update(t,dt,focus,camera), setQuality(q,prof) }
import * as THREE from 'three';
import { makeExhibit } from './exhibit.js';
import { WINGS, PERIOD } from './data/news.js';

const W = 10, H = 6, WALL_OFF = 0.55, VIEW_D = 3.0;
const SPACING = 4.8, ROOM_GAP = 7.5, PART_T = 0.7, PORTAL_W = 3.4, PORTAL_H = 4.3;
const LOBBY = 14, ATRIUM = 16, SKY_EVERY = 9.6, SKY_W = 3.2, SKY_D = 4.4;
const F_EN = '"Cormorant Garamond","Times New Roman",serif';
const F_JP = '"Noto Serif JP","Shippori Mincho","Hiragino Mincho ProN","Yu Mincho",serif';
const F_SANS = '"Inter","Helvetica Neue",Arial,sans-serif';
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// ---------- 決定論的乱数 ----------
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// ---------- テクスチャ ----------
function travertine(renderer) {
  // 1枚 = 2.4m x 2.4m（1.2 x 0.6m の石目地 2列 x 4段）
  const S = 1024, rnd = rng(7);
  const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const r = document.createElement('canvas'); r.width = r.height = S / 2; const gr = r.getContext('2d');
  gr.fillStyle = 'rgb(92,92,92)'; gr.fillRect(0, 0, S / 2, S / 2); // roughness ~0.36
  for (let row = 0; row < 4; row++) for (let col = 0; col < 2; col++) {
    const x0 = col * S / 2 + (row % 2 ? S / 4 : 0), y0 = row * S / 4;
    const tone = 222 + rnd() * 14, warm = 6 + rnd() * 6;
    for (const dx of [0, -S]) {
      const X = ((x0 + dx) % S + S) % S;
      g.fillStyle = `rgb(${tone + 4},${tone - warm * 0.4},${tone - warm * 1.6})`;
      g.fillRect(X, y0, S / 2, S / 4);
    }
    // トラバーチン特有の横方向の層と小孔
    for (let k = 0; k < 46; k++) {
      const yy = y0 + rnd() * S / 4, a = 0.03 + rnd() * 0.07, th = 1 + rnd() * 5;
      g.fillStyle = `rgba(${150 + rnd() * 40},${125 + rnd() * 30},${95 + rnd() * 25},${a})`;
      const xx = ((x0 + rnd() * S / 2) % S), len = 40 + rnd() * 420;
      g.fillRect(xx, yy, len, th); if (xx + len > S) g.fillRect(xx - S, yy, len, th);
    }
    for (let k = 0; k < 220; k++) {
      const px = (x0 + rnd() * S / 2) % S, py = y0 + rnd() * S / 4, pw = 1 + rnd() * 7, ph = 0.6 + rnd() * 1.8;
      g.fillStyle = `rgba(120,98,72,${0.10 + rnd() * 0.22})`; g.fillRect(px, py, pw, ph);
      gr.fillStyle = `rgba(190,190,190,0.8)`; gr.fillRect(px / 2, py / 2, pw / 2 + 0.5, ph / 2 + 0.5);
    }
  }
  // 目地
  g.fillStyle = 'rgba(150,135,112,0.55)'; gr.fillStyle = 'rgb(170,170,170)';
  for (let row = 0; row <= 4; row++) { g.fillRect(0, row * S / 4 - 1, S, 2); gr.fillRect(0, row * S / 8 - 0.5, S / 2, 1); }
  for (let row = 0; row < 4; row++) for (let col = 0; col <= 2; col++) {
    const x = (col * S / 2 + (row % 2 ? S / 4 : 0)) % S;
    g.fillRect(x - 1, row * S / 4, 2, S / 4); gr.fillRect(x / 2 - 0.5, row * S / 8, 1, S / 8);
  }
  const map = new THREE.CanvasTexture(c), rough = new THREE.CanvasTexture(r);
  for (const t of [map, rough]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); }
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, rough };
}

function plaster() {
  const S = 512, rnd = rng(11), c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = '#ece7de'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const v = rnd() < 0.5 ? 255 : 200; g.fillStyle = `rgba(${v},${v - 4},${v - 10},${0.035 + rnd() * 0.04})`;
    const s = 2 + rnd() * 18; g.beginPath(); g.ellipse(rnd() * S, rnd() * S, s, s * (0.3 + rnd() * 0.7), rnd() * 3.14, 0, 6.29); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

// 壁面の刻字 / 切文字（透明背景）。lines: [{text,font,size,y,color,spacing,align,x}]
function letterTex(lines, w = 1024, h = 512) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  for (const L of lines) {
    g.font = L.font; g.fillStyle = L.color || '#3b352e'; g.textBaseline = 'middle'; g.textAlign = L.align || 'center';
    if ('letterSpacing' in g) g.letterSpacing = `${L.spacing || 0}px`;
    g.fillText(L.text, L.x ?? w / 2, L.y);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ---------- 本体 ----------
export function buildMuseum(scene, NEWS, renderer) {
  const root = new THREE.Group(); root.name = 'museum_f'; scene.add(root);
  const exhibits = [], stops = [], viewPoints = [], skylights = [];
  const tmp = new THREE.Vector3();

  // マテリアル（共有）
  const trav = travertine(renderer);
  const floorMat = new THREE.MeshPhysicalMaterial({ map: trav.map, roughnessMap: trav.rough, roughness: 1, metalness: 0,
    clearcoat: 0.35, clearcoatRoughness: 0.22, envMapIntensity: 0.9 });
  const plasterTex = plaster();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe6e0d6, map: plasterTex, roughness: 0.92, metalness: 0, envMapIntensity: 0.6 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0xf3efe7, roughness: 0.95, envMapIntensity: 0.5 });
  const stoneMat = new THREE.MeshStandardMaterial({ map: trav.map, roughnessMap: trav.rough, roughness: 1, color: 0xf2ece2, envMapIntensity: 0.7 });
  const oakMat = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.55, metalness: 0 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.32, metalness: 1, envMapIntensity: 1.2 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.6, metalness: 0.2 });
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff3df).multiplyScalar(1.6) }); // 天窓拡散板（暖白・低彩度）
  const unitBox = new THREE.BoxGeometry(1, 1, 1);

  // ---------- 展示の配置 ----------
  let z = -2.5, prevWing = null, side = -1, roomIdx = -1;
  const gates = []; // {z, room, wing}
  NEWS.forEach((n, i) => {
    if (n.wing !== prevWing) {
      roomIdx++;
      if (prevWing !== null) { z -= ROOM_GAP / 2; gates.push({ z, room: roomIdx, wing: WINGS.find(w => w.id === n.wing) }); z -= ROOM_GAP / 2; side = -1; }
      prevWing = n.wing;
    }
    const ex = makeExhibit(n, i, renderer);
    const x = side * (W / 2 - WALL_OFF);
    ex.position.set(x, 0, z); ex.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    root.add(ex); ex.updateMatrixWorld(true);
    const anchor = ex.localToWorld(new THREE.Vector3(0, 1.6, -0.25));
    const viewPos = new THREE.Vector3(side * (W / 2 - VIEW_D), 1.62, z + 0.35);
    exhibits.push({ mesh: ex, anchor, viewPos, news: n, side });
    z -= SPACING; side *= -1;
  });
  const lastZ = z + SPACING;
  const atriumZ0 = lastZ - 5, endZ = atriumZ0 - ATRIUM;
  const zMax = LOBBY, len = zMax - endZ;

  // ---------- 床 ----------
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, len), floorMat);
  fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0, (zMax + endZ) / 2); fl.receiveShadow = true;
  floorMat.map.repeat.set(W / 2.4, len / 2.4); // map/rough は同じ repeat を共有
  trav.rough.repeat.copy(floorMat.map.repeat);
  root.add(fl);

  // ---------- 壁（左右 + 前後） ----------
  const wallGeo = new THREE.PlaneGeometry(len, H);
  plasterTex.repeat.set(len / 4, H / 4);
  [-1, 1].forEach(s => {
    const w = new THREE.Mesh(wallGeo, wallMat);
    w.rotation.y = -s * Math.PI / 2; w.position.set(s * W / 2, H / 2, (zMax + endZ) / 2); w.receiveShadow = true; root.add(w);
    // オーク巾木 + 影目地
    const base = new THREE.Mesh(unitBox, oakMat); base.scale.set(0.03, 0.11, len); base.position.set(s * (W / 2 - 0.015), 0.055, (zMax + endZ) / 2); root.add(base);
    const gap = new THREE.Mesh(unitBox, darkMat); gap.scale.set(0.02, 0.012, len); gap.position.set(s * (W / 2 - 0.01), 0.116, (zMax + endZ) / 2); root.add(gap);
    // ダクトレール（真鍮）
    const rail = new THREE.Mesh(unitBox, brassMat); rail.scale.set(0.035, 0.03, len - 4); rail.position.set(s * 2.9, H - 0.02, (zMax + endZ) / 2); root.add(rail);
  });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat); back.position.set(0, H / 2, zMax); back.rotation.y = Math.PI; root.add(back);

  // ---------- 天井（格天井 + 天窓） ----------
  for (let sz = zMax - 6; sz > endZ + ATRIUM; sz -= SKY_EVERY) skylights.push({ x: 0, y: H, z: sz, w: SKY_W, d: SKY_D });
  const slabs = [], wells = [];
  let cur = zMax;
  for (const s of skylights) {
    const z1 = s.z + SKY_D / 2, z0 = s.z - SKY_D / 2;
    slabs.push([0, cur, z1, W]);                       // 天窓間のフル幅スラブ
    slabs.push([-(W / 4 + SKY_W / 4), z1, z0, W / 2 - SKY_W / 2]); // 開口の両脇
    slabs.push([(W / 4 + SKY_W / 4), z1, z0, W / 2 - SKY_W / 2]);
    wells.push(s); cur = z0;
  }
  slabs.push([0, cur, endZ + ATRIUM, W]);
  const slabMesh = new THREE.InstancedMesh(unitBox, ceilMat, slabs.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  slabs.forEach(([x, za, zb, w], i) => {
    m4.compose(ps.set(x, H + 0.15, (za + zb) / 2), q.identity(), sc.set(w, 0.3, Math.abs(za - zb))); slabMesh.setMatrixAt(i, m4);
  });
  root.add(slabMesh);
  // 梁（白い格子）
  const beams = [];
  for (let bz = zMax - 1.5; bz > endZ + ATRIUM; bz -= 3.2) if (!skylights.some(s => Math.abs(s.z - bz) < SKY_D / 2 + 0.3)) beams.push(bz);
  const beamMesh = new THREE.InstancedMesh(unitBox, ceilMat, beams.length + 2);
  beams.forEach((bz, i) => { m4.compose(ps.set(0, H - 0.12, bz), q.identity(), sc.set(W, 0.24, 0.22)); beamMesh.setMatrixAt(i, m4); });
  [-1, 1].forEach((s, k) => { m4.compose(ps.set(s * (SKY_W / 2 + 0.6), H - 0.1, (zMax + endZ + ATRIUM) / 2), q.identity(), sc.set(0.2, 0.2, zMax - endZ - ATRIUM)); beamMesh.setMatrixAt(beams.length + k, m4); });
  beamMesh.castShadow = false; root.add(beamMesh);
  // ライトウェル（開口の内壁 + 拡散板 + 桟）
  const WELL = 1.3;
  const wellWalls = new THREE.InstancedMesh(unitBox, ceilMat, wells.length * 4);
  const diffusers = new THREE.InstancedMesh(unitBox, glowMat, wells.length);
  const mull = new THREE.InstancedMesh(unitBox, darkMat, wells.length * 5);
  wells.forEach((s, i) => {
    const yc = H + WELL / 2;
    [[s.x - SKY_W / 2 - 0.05, yc, s.z, 0.1, WELL, SKY_D], [s.x + SKY_W / 2 + 0.05, yc, s.z, 0.1, WELL, SKY_D],
     [s.x, yc, s.z - SKY_D / 2 - 0.05, SKY_W, WELL, 0.1], [s.x, yc, s.z + SKY_D / 2 + 0.05, SKY_W, WELL, 0.1]]
      .forEach(([x, y, zz, a, b, c], k) => { m4.compose(ps.set(x, y, zz), q.identity(), sc.set(a, b, c)); wellWalls.setMatrixAt(i * 4 + k, m4); });
    m4.compose(ps.set(s.x, H + WELL, s.z), q.identity(), sc.set(SKY_W, 0.02, SKY_D)); diffusers.setMatrixAt(i, m4);
    // 桟（3x4 枚の窓割り — fx の光だまりの桟の影と一致）
    [-SKY_W / 6, SKY_W / 6].forEach((dx, k) => { m4.compose(ps.set(s.x + dx, H + WELL - 0.03, s.z), q.identity(), sc.set(0.04, 0.05, SKY_D)); mull.setMatrixAt(i * 5 + k, m4); });
    [-SKY_D / 4, 0, SKY_D / 4].forEach((dz, k) => { m4.compose(ps.set(s.x, H + WELL - 0.03, s.z + dz), q.identity(), sc.set(SKY_W, 0.05, 0.04)); mull.setMatrixAt(i * 5 + 2 + k, m4); });
  });
  root.add(wellWalls, diffusers, mull);

  // ---------- 間仕切り + ポータル ----------
  function gate(zg, opts) {
    const g = new THREE.Group(); g.position.z = zg; root.add(g);
    const sideW = (W - PORTAL_W) / 2;
    [-1, 1].forEach(s => {
      const p = new THREE.Mesh(unitBox, wallMat); p.scale.set(sideW, H, PART_T); p.position.set(s * (PORTAL_W / 2 + sideW / 2), H / 2, 0);
      p.castShadow = true; p.receiveShadow = true; g.add(p);
    });
    const lintel = new THREE.Mesh(unitBox, wallMat); lintel.scale.set(PORTAL_W, H - PORTAL_H, PART_T); lintel.position.set(0, (H + PORTAL_H) / 2, 0); lintel.castShadow = true; g.add(lintel);
    // 開口の額縁（トラバーチン）
    const jamb = (x, y, a, b) => { const j = new THREE.Mesh(unitBox, stoneMat); j.scale.set(a, b, PART_T + 0.06); j.position.set(x, y, 0); g.add(j); };
    jamb(-PORTAL_W / 2 - 0.09, PORTAL_H / 2, 0.18, PORTAL_H); jamb(PORTAL_W / 2 + 0.09, PORTAL_H / 2, 0.18, PORTAL_H); jamb(0, PORTAL_H + 0.09, PORTAL_W + 0.36, 0.18);
    // 室名（来館者側の面 = +Z）
    if (opts.left) { const t = new THREE.Mesh(new THREE.PlaneGeometry(sideW * 0.86, sideW * 0.43), new THREE.MeshStandardMaterial({ map: opts.left, transparent: true, roughness: 0.8, ...(opts.leftMetal ? { metalness: 1, roughness: 0.35, color: 0xc9a46a } : {}) }));
      t.position.set(-(PORTAL_W / 2 + sideW / 2), opts.leftY ?? 2.1, PART_T / 2 + 0.004); g.add(t); }
    if (opts.right) { const t = new THREE.Mesh(new THREE.PlaneGeometry(sideW * 0.86, sideW * 0.43), new THREE.MeshStandardMaterial({ map: opts.right, transparent: true, roughness: 0.85 }));
      t.position.set(PORTAL_W / 2 + sideW / 2, opts.rightY ?? 2.1, PART_T / 2 + 0.004); g.add(t); }
    if (opts.lintel) { const t = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.86, (W * 0.86) / 6), new THREE.MeshStandardMaterial({ map: opts.lintel, transparent: true, color: 0xd8b67a, metalness: 1, roughness: 0.3, envMapIntensity: 1.4 }));
      t.position.set(0, PORTAL_H + (H - PORTAL_H) / 2 + 0.05, PART_T / 2 + 0.01); g.add(t); }
    return g;
  }
  const roomSign = (room, wing) => ({
    left: letterTex([{ text: ROMAN[room] || String(room + 1), font: `300 300px ${F_EN}`, y: 250, color: '#a88a5c' }]),
    right: letterTex([
      { text: `ROOM ${ROMAN[room] || room + 1}`, font: `500 46px ${F_SANS}`, y: 92, color: '#8c7a62', spacing: 14, align: 'left', x: 40 },
      { text: wing?.name || '', font: `500 104px ${F_EN}`, y: 200, color: '#2f2a25', spacing: 6, align: 'left', x: 36 },
      { text: wing?.sub || '', font: `500 54px ${F_JP}`, y: 312, color: '#4a423a', align: 'left', x: 40 },
      { text: (wing?.range || '').replace(/—/g, '–'), font: `400 44px ${F_SANS}`, y: 404, color: '#8c7a62', spacing: 8, align: 'left', x: 40 },
    ]),
  });
  // 入口（館名 + Room I）
  const from = PERIOD?.from || '2026-08-12', to = PERIOD?.to || '2026-10-01';
  gate(0, {
    lintel: letterTex([{ text: 'FLAT  TRAIL', font: `500 150px ${F_EN}`, y: 92, color: '#ffffff', spacing: 40 }], 1536, 256),
    ...roomSign(0, WINGS.find(w => w.id === NEWS[0]?.wing)),
  });
  // ロビーの館銘板（左右の壁）
  const plate = letterTex([
    { text: 'THE MUSEUM OF AI HEADLINES', font: `500 50px ${F_SANS}`, y: 120, color: '#7d6c55', spacing: 16 },
    { text: 'AIの50日', font: `500 120px ${F_JP}`, y: 250, color: '#2f2a25', spacing: 12 },
    { text: `${from.replace(/-/g, '.')}  —  ${to.replace(/-/g, '.')}   ·   ${NEWS.length} HEADLINES`, font: `400 42px ${F_SANS}`, y: 380, color: '#7d6c55', spacing: 6 },
  ]);
  [-1, 1].forEach(s => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8), new THREE.MeshStandardMaterial({ map: plate, transparent: true, roughness: 0.85 }));
    p.position.set(s * (W / 2 - 0.01), 2.0, 7); p.rotation.y = -s * Math.PI / 2; root.add(p);
  });
  gates.forEach(gt => gate(gt.z, roomSign(gt.room, gt.wing)));

  // ---------- 終端アトリウム ----------
  const A_H = 11;
  const atr = new THREE.Group(); root.add(atr);
  // 高い壁と大窓（暖白の空 + 黒い方立）
  [-1, 1].forEach(s => { const w = new THREE.Mesh(unitBox, wallMat); w.scale.set(0.4, A_H, ATRIUM); w.position.set(s * (W / 2 + 0.2), A_H / 2, endZ + ATRIUM / 2); w.receiveShadow = true; atr.add(w); });
  const upper = new THREE.Mesh(unitBox, wallMat); upper.scale.set(W, A_H - H, 0.4); upper.position.set(0, H + (A_H - H) / 2, endZ + ATRIUM + 0.2); atr.add(upper);
  const roofA = new THREE.Mesh(unitBox, ceilMat); roofA.scale.set(W + 0.8, 0.3, ATRIUM); roofA.position.set(0, A_H + 0.15, endZ + ATRIUM / 2); atr.add(roofA);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(W - 1.2, A_H - 1.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff1dc).multiplyScalar(1.35) }));
  sky.position.set(0, (A_H - 1.6) / 2 + 0.4, endZ + 0.02); atr.add(sky);
  const frameBack = new THREE.Mesh(new THREE.PlaneGeometry(W, A_H), wallMat); frameBack.position.set(0, A_H / 2, endZ); atr.add(frameBack);
  sky.position.z = endZ + 0.03;
  for (let k = -2; k <= 2; k++) { const mm = new THREE.Mesh(unitBox, darkMat); mm.scale.set(0.07, A_H - 1.6, 0.08); mm.position.set(k * (W - 1.2) / 5 + (k === 0 ? 0 : 0), (A_H - 1.6) / 2 + 0.4, endZ + 0.08); if (Math.abs(k) < 3) atr.add(mm); }
  [2.4, 5.2, 8.0].forEach(y => { const tr = new THREE.Mesh(unitBox, darkMat); tr.scale.set(W - 1.2, 0.07, 0.08); tr.position.set(0, y, endZ + 0.08); atr.add(tr); });
  // ベンチ（トラバーチン + オーク）
  const bench = new THREE.Group(); bench.position.set(0, 0, endZ + 6.5); atr.add(bench);
  const bb = new THREE.Mesh(unitBox, stoneMat); bb.scale.set(3.2, 0.36, 0.7); bb.position.y = 0.18; bb.castShadow = bb.receiveShadow = true; bench.add(bb);
  const bt = new THREE.Mesh(unitBox, oakMat); bt.scale.set(3.3, 0.06, 0.76); bt.position.y = 0.39; bt.castShadow = true; bench.add(bt);
  // 床の刻字
  const endText = letterTex([
    { text: 'THE TRAIL CONTINUES', font: `500 92px ${F_EN}`, y: 170, color: '#5b5046', spacing: 18 },
    { text: 'そして、次の50日へ', font: `500 64px ${F_JP}`, y: 320, color: '#6e6255', spacing: 10 },
  ]);
  const et = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.6), new THREE.MeshStandardMaterial({ map: endText, transparent: true, roughness: 0.6, depthWrite: false }));
  et.rotation.x = -Math.PI / 2; et.position.set(0, 0.004, endZ + 9.5); atr.add(et);
  skylights.push({ x: 0, y: A_H, z: endZ + ATRIUM * 0.55, w: 4.2, d: 5.0 });
  // アトリウム天窓の開口（見た目）
  const atrSky = new THREE.Mesh(unitBox, glowMat); atrSky.scale.set(4.2, 0.02, 5.0); atrSky.position.set(0, A_H + 0.31, endZ + ATRIUM * 0.55); atr.add(atrSky);

  // ---------- 器具（ダクトレールのスポット: 見た目のみ） ----------
  const fixGeo = new THREE.CylinderGeometry(0.055, 0.07, 0.2, 14, 1, false);
  const fixtures = new THREE.InstancedMesh(fixGeo, darkMat, exhibits.length * 2);
  exhibits.forEach((e, i) => {
    [-0.9, 0.9].forEach((dz, k) => {
      const p = new THREE.Vector3(e.side * 2.9, H - 0.16, e.anchor.z + dz);
      const dir = tmp.copy(e.anchor).sub(p).normalize();
      q.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      m4.compose(p, q, sc.set(1, 1, 1)); fixtures.setMatrixAt(i * 2 + k, m4);
    });
  });
  root.add(fixtures);

  // ---------- 照明 ----------
  const hemi = new THREE.HemisphereLight(0xfff6ea, 0xb9ad9a, 0.5); root.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.0);
  const SUN_DIR = new THREE.Vector3(-0.45, 1, -0.33).normalize();
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 16, bottom: -16, near: 0.5, far: 40 }); sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.radius = 3;
  root.add(sun, sun.target);
  let shadowZ = 1e9;
  const placeSun = (cz) => {
    const zc = Math.round(cz / 6) * 6 - 6;
    if (zc === shadowZ) return; shadowZ = zc;
    sun.target.position.set(0, 0, zc); sun.position.copy(SUN_DIR).multiplyScalar(20).add(sun.target.position);
    sun.target.updateMatrixWorld(); if (renderer.shadowMap) renderer.shadowMap.needsUpdate = true;
  };
  placeSun(8);
  // ライトプール: 影なし SpotLight ×3 をカメラ近傍の展示へ割当
  const pool = [0, 1, 2].map(() => {
    const L = new THREE.SpotLight(0xffe8c8, 0, 9, 0.42, 0.55, 1.6); L.castShadow = false; root.add(L, L.target); return { L, idx: -1, k: 0 };
  });
  const wFocus = exhibits.map(e => { const ud = e.mesh.userData; return e.mesh.localToWorld((ud.focus || new THREE.Vector3(0, 1.6, -0.5)).clone()); });
  const wLight = exhibits.map(e => { const ud = e.mesh.userData; return e.mesh.localToWorld((ud.lightPos || new THREE.Vector3(0, 3.7, 2)).clone()); });
  const near = exhibits.map((_, i) => i);

  // ---------- カメラパス ----------
  const entrance = { pos: new THREE.Vector3(0, 1.66, 9.5), look: new THREE.Vector3(0, 2.7, 0) };
  viewPoints.push(entrance.pos); stops.push({ kind: 'intro', look: entrance.look });
  viewPoints.push(new THREE.Vector3(0, 1.64, 2.2)); // ポータル通過用の中継点（停止しない）
  exhibits.forEach((e, i) => {
    // ポータル直前/直後の中継点で間仕切りを避ける
    const gt = gates.find(g => g.z < (exhibits[i - 1]?.anchor.z ?? 1e9) && g.z > e.anchor.z);
    if (gt) { viewPoints.push(new THREE.Vector3(0, 1.64, gt.z + 1.6)); viewPoints.push(new THREE.Vector3(0, 1.64, gt.z - 1.6)); }
    viewPoints.push(e.viewPos); stops.push({ kind: 'exhibit', index: i, look: e.anchor, _vp: viewPoints.length - 1 });
  });
  viewPoints.push(new THREE.Vector3(0, 1.64, atriumZ0 + 1));
  const finale = { pos: new THREE.Vector3(0, 1.68, endZ + 11.5), look: new THREE.Vector3(0, 4.2, endZ) };
  viewPoints.push(finale.pos); stops.push({ kind: 'finale', look: finale.look });
  stops[0]._vp = 0; stops[stops.length - 1]._vp = viewPoints.length - 1;
  const path = new THREE.CatmullRomCurve3(viewPoints, false, 'centripetal', 0.5);
  // 停止点の t は弧長パラメータ u（controls は getPointAt(u) を使う）
  const DIV = (viewPoints.length - 1) * 24, lens = path.getLengths(DIV), total = lens[DIV];
  stops.forEach(s => { s.t = lens[s._vp * 24] / total; s.pos = viewPoints[s._vp]; delete s._vp; });

  // ---------- 品質 ----------
  function setQuality(q, prof = {}) {
    const on = prof.shadows ?? q !== 'low';
    sun.castShadow = on;
    const ms = prof.shadowMap || (q === 'high' ? 1024 : 768);
    if (sun.shadow.mapSize.x !== ms) { sun.shadow.mapSize.set(ms, ms); sun.shadow.map?.dispose(); sun.shadow.map = null; }
    floorMat.clearcoat = q === 'low' ? 0 : 0.35; floorMat.needsUpdate = true;
    if (renderer.shadowMap) renderer.shadowMap.needsUpdate = true;
  }

  return {
    root, exhibits, path, stops, endZ, skylights, hall: { width: W, height: H }, sun,
    setQuality,
    update(t, dt, focusIndex = -1, camera) {
      for (let i = 0; i < exhibits.length; i++) {
        const ud = exhibits[i].mesh.userData;
        ud.focusTarget = i === focusIndex ? 1 : 0;
        ud.update?.(t, dt);
      }
      const cz = camera ? camera.position.z : 8;
      placeSun(cz);
      sun.intensity = 2.0 * (window.__FT?.fx?.sun ?? 1);
      // ライトプール割当: カメラに近い3展示
      near.sort((a, b) => Math.abs(exhibits[a].anchor.z - cz) - Math.abs(exhibits[b].anchor.z - cz));
      const want = near.slice(0, 3);
      for (const p of pool) if (!want.includes(p.idx)) p.idx = -1;
      for (const i of want) if (!pool.some(p => p.idx === i)) { const p = pool.find(pp => pp.idx === -1); if (p) { p.idx = i; p.k = 0; p.L.position.copy(wLight[i]); p.L.target.position.copy(wFocus[i]); p.L.target.updateMatrixWorld(); } }
      for (const p of pool) {
        const goal = p.idx < 0 ? 0 : (p.idx === focusIndex ? 42 : 24);
        p.k += (goal - p.k) * Math.min(1, dt * 2.5);
        p.L.intensity = p.k; // visible は切替えない（ライト数変化＝全シェーダ再コンパイルになるため）
      }
    },
  };
}
