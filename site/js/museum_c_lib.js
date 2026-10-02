// museum_c_lib.js — Owner: C。建築ゾーン（cupola / gallery / sistine）共有の建築ツールキット。
//  - sweep2D: 断面プロファイルを折れ線に沿って「留め継ぎ(miter)」で掃引 → コーニス・巾木・額縁・アーキトレーブ・リブ
//  - Bucket: 同一マテリアルのジオメトリを1ドローコールにマージ
//  - 手続き的レリーフ（卵鏃文・歯飾り・格間ロゼット・ダマスク）の高さ場 → 法線マップ
//  - CC0 PBR（ambientCG / Poly Haven: site/assets/arch/*）からのマテリアル生成
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const F_EN = '"Cormorant Garamond","Times New Roman",serif';
export const F_JP = '"Noto Serif JP","Shippori Mincho","Hiragino Mincho ProN","Yu Mincho",serif';
export const F_SANS = '"Inter","Helvetica Neue",Arial,sans-serif';
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// ───────────────────────── 掃引（miter 付き） ─────────────────────────
/**
 * 断面 profile [[a,b],...]（a=折れ線から「左法線×side」方向へのオフセット, b=面の法線 N 方向の突出）を
 * 2D 折れ線 poly [[u,v],...] に沿って掃引する。座標は origin + U*u + V*v + N*b。
 * 角は留め継ぎ（各辺を別グリッドにして角で法線を割る）。UV: x=折れ線方向の長さ(m), y=断面の弧長(m)。
 */
export function sweep2D(profile, poly, { closed = false, side = 1, origin = v3(), U = v3(1, 0, 0), V = v3(0, 0, 1), N = v3(0, 1, 0), flip = false } = {}) {
  const P = poly.map(([u, v]) => new THREE.Vector2(u, v));
  const n = P.length, segs = closed ? n : n - 1;
  const segN = [];
  for (let i = 0; i < segs; i++) { const a = P[i], b = P[(i + 1) % n]; const d = b.clone().sub(a).normalize(); segN.push(new THREE.Vector2(-d.y, d.x).multiplyScalar(side)); }
  const miter = (i) => { // 頂点 i の留め継ぎベクトル（長さ = 1/cos）
    const prev = closed ? segN[(i - 1 + segs) % segs] : segN[i - 1], next = closed ? segN[i % segs] : segN[i];
    if (!prev) return next.clone(); if (!next) return prev.clone();
    const m = prev.clone().add(next).normalize(); const c = m.dot(next); return m.multiplyScalar(1 / Math.max(0.2, c));
  };
  const prof = profile.map(([a, b]) => new THREE.Vector2(a, b));
  const plen = [0]; for (let k = 1; k < prof.length; k++) plen.push(plen[k - 1] + prof[k].distanceTo(prof[k - 1]));
  const geos = []; let ucum = 0;
  const tmp = v3();
  for (let i = 0; i < segs; i++) {
    const i0 = i, i1 = (i + 1) % n, m0 = miter(i0), m1 = miter(i1);
    const pos = [], uv = [], idx = [];
    const segLen = P[i0].distanceTo(P[i1]);
    for (let e = 0; e < 2; e++) {
      const p = e ? P[i1] : P[i0], m = e ? m1 : m0;
      for (let k = 0; k < prof.length; k++) {
        const [a, b] = [prof[k].x, prof[k].y];
        tmp.copy(origin).addScaledVector(U, p.x + m.x * a).addScaledVector(V, p.y + m.y * a).addScaledVector(N, b);
        pos.push(tmp.x, tmp.y, tmp.z); uv.push(ucum + (e ? segLen : 0), plen[k]);
      }
    }
    const L = prof.length;
    for (let k = 0; k < L - 1; k++) { const a = k, b = k + 1, c = L + k, d = L + k + 1; if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals(); geos.push(g); ucum += segLen;
  }
  const out = mergeGeometries(geos); geos.forEach((g) => g.dispose()); return out;
}

/** 断面を滑らかにする（円弧・凹凸を細分）: 角は keep、曲線は arc(cx,cy,r,a0,a1,steps) */
export const arc = (cx, cy, r, a0, a1, steps = 8) => Array.from({ length: steps + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / steps; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });

// 代表的な古典モールディング断面（a=壁からの出, b=高さ）— 単位 m。下から上へ。
export const PROFILES = {
  // 大コーニス（ベッドモールド→歯飾り帯→コロナ→シーマ・レクタ）高さ ~0.62, 出 ~0.48
  cornice: [[0, 0], [0.02, 0], [0.02, 0.03], ...arc(0.02, 0.07, 0.04, -Math.PI / 2, Math.PI / 2, 6).map(([a, b]) => [a + 0.0, b]).slice(1),
    [0.05, 0.11], [0.05, 0.2], [0.07, 0.2], [0.07, 0.22], [0.16, 0.22], [0.16, 0.24], ...arc(0.16, 0.30, 0.06, -Math.PI / 2, 0, 5).slice(1),
    [0.24, 0.30], [0.24, 0.32], [0.36, 0.34], [0.38, 0.44], [0.385, 0.46], [0.36, 0.46], [0.36, 0.48],
    ...arc(0.42, 0.48, 0.06, Math.PI, Math.PI / 2, 5).slice(1), ...arc(0.42, 0.60, 0.06, -Math.PI / 2, 0, 5).slice(1), [0.48, 0.62], [0.48, 0.64], [0.0, 0.64]],
  // 巾木（プリンス＋トーラス＋スコシア）高さ 0.26
  plinth: [[0, 0], [0.035, 0], [0.035, 0.17], [0.03, 0.18], ...arc(0.03, 0.2, 0.02, -Math.PI / 2, Math.PI / 2, 6).slice(1), [0.012, 0.22], [0.012, 0.24], [0.0, 0.26]],
  // チェアレール（腰壁笠木）高さ 0.1
  chair: [[0, 0], [0.02, 0], ...arc(0.02, 0.025, 0.025, -Math.PI / 2, 0, 4).slice(1), [0.05, 0.05], [0.055, 0.06], ...arc(0.04, 0.075, 0.02, -Math.PI / 4, Math.PI / 2, 5).slice(1), [0.02, 0.095], [0.0, 0.1]],
  // 細い金の玉縁（ビーズ）幅 0.03
  bead: arc(0, 0.015, 0.015, -Math.PI / 2, Math.PI / 2, 8).map(([a, b]) => [Math.max(0, a), b]),
  // 額縁状アーキトレーブ（扉枠）幅 0.34, 出 0.09
  architrave: [[-0.02, 0], [0.0, 0.0], [0.0, 0.05], [0.04, 0.05], [0.04, 0.065], [0.12, 0.065], [0.12, 0.075], [0.22, 0.075],
    ...arc(0.26, 0.075, 0.04, Math.PI, Math.PI / 2, 4).slice(1), [0.3, 0.09], [0.34, 0.09], [0.34, 0.0]],
  // 小さなリブ（ヴォールトの帯）幅 0.36 突出 0.06
  rib: [[-0.18, 0], [-0.18, 0.02], [-0.15, 0.035], [-0.12, 0.05], ...arc(0, 0.05, 0.12, Math.PI, 0, 10).map(([a, b]) => [a, 0.05 + (b - 0.05) * 0.1]).slice(1), [0.15, 0.035], [0.18, 0.02], [0.18, 0]],
};

// ───────────────────────── マージ用バケット ─────────────────────────
export class Bucket {
  constructor() { this.map = new Map(); }
  add(key, geo, matrix) { const g = matrix ? geo.clone().applyMatrix4(matrix) : geo; if (!this.map.has(key)) this.map.set(key, []); this.map.get(key).push(g); return g; }
  /** mats: { key: Material }。key ごとに1メッシュ。 */
  build(group, mats, { castShadow = true, receiveShadow = true } = {}) {
    const out = {};
    for (const [key, list] of this.map) {
      const ok = list.map((g) => { if (!g.index) return g; return g; });
      const attrs = ['position', 'normal', 'uv'];
      ok.forEach((g) => { for (const a of Object.keys(g.attributes)) if (!attrs.includes(a)) g.deleteAttribute(a); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); });
      const nonIdx = ok.some((g) => !g.index);
      const merged = mergeGeometries(nonIdx ? ok.map((g) => g.index ? g.toNonIndexed() : g) : ok);
      if (!merged) { console.warn('[museum_c] merge failed', key); continue; }
      const m = new THREE.Mesh(merged, mats[key]); m.name = `c-${key}`; m.castShadow = castShadow; m.receiveShadow = receiveShadow; group.add(m); out[key] = m;
      list.forEach((g) => g.dispose());
    }
    this.map.clear(); return out;
  }
}
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = v3(), _p = v3(), _e = new THREE.Euler();
export const mat4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(v3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), v3(sx, sy, sz));
/** 箱（UV をメートル単位に） */
export function boxM(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv, nrm = g.attributes.normal, pos = g.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (nx > 0.5) uv.setXY(i, z, y); else if (ny > 0.5) uv.setXY(i, x, z); else uv.setXY(i, x, y);
  }
  return g;
}
/** 平面（UV メートル）: w × h, 原点中心, +Z 向き */
export function planeM(w, h, ox = 0, oy = 0) { const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) + ox, p.getY(i) + oy); return g; }

// ───────────────────────── 高さ場 → 法線マップ ─────────────────────────
export function heightToNormal(srcCanvas, strength = 2.5) {
  const w = srcCanvas.width, h = srcCanvas.height, g = srcCanvas.getContext('2d');
  const src = g.getImageData(0, 0, w, h).data, out = new ImageData(w, h), o = out.data;
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    o[i] = (-dx / l * 0.5 + 0.5) * 255; o[i + 1] = (dy / l * 0.5 + 0.5) * 255; o[i + 2] = (1 / l * 0.5 + 0.5) * 255; o[i + 3] = 255;
  }
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(out, 0, 0); return c;
}
/** 凹部を暗くする AO 風（高さ場から）*/
export function heightToCavity(srcCanvas, base = '#d4af37', dark = 0.45) {
  const w = srcCanvas.width, h = srcCanvas.height, src = srcCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); const img = g.createImageData(w, h);
  const col = new THREE.Color(base);
  for (let i = 0; i < w * h; i++) { const k = dark + (1 - dark) * Math.pow(src[i * 4] / 255, 0.6); img.data[i * 4] = col.r * 255 * k; img.data[i * 4 + 1] = col.g * 255 * k; img.data[i * 4 + 2] = col.b * 255 * k; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0); return c;
}
const blob = (g, x, y, rx, ry, a0 = 1, a1 = 0) => { const gr = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry)); gr.addColorStop(0, `rgba(255,255,255,${a0})`); gr.addColorStop(1, `rgba(255,255,255,${a1})`); g.save(); g.translate(x, y); g.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); g.translate(-x, -y); g.fillStyle = gr; g.beginPath(); g.arc(x, y, Math.max(rx, ry), 0, 7); g.fill(); g.restore(); };
/** 高さ場のキャンバス群（全て横方向にタイル可能） */
export const RELIEF = {
  // 卵鏃文（エッグ・アンド・ダート）: 1 タイル = 卵1 + 鏃1
  eggDart(w = 256, h = 128) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.fillStyle = '#202020'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#5a5a5a'; g.fillRect(0, 0, w, h * 0.12); g.fillRect(0, h * 0.88, w, h * 0.12); // 上下の平縁
    // 卵の殻（外枠）
    g.strokeStyle = '#8c8c8c'; g.lineWidth = w * 0.05; g.beginPath(); g.ellipse(w * 0.5, h * 0.48, w * 0.3, h * 0.36, 0, 0, 7); g.stroke();
    blob(g, w * 0.5, h * 0.5, w * 0.24, h * 0.32, 1, 0.25);
    // 鏃（ダート）
    g.fillStyle = '#9a9a9a'; g.beginPath(); g.moveTo(0, h * 0.14); g.lineTo(w * 0.05, h * 0.5); g.lineTo(0, h * 0.86); g.lineTo(-w * 0.05, h * 0.5); g.fill();
    g.beginPath(); g.moveTo(w, h * 0.14); g.lineTo(w * 1.05, h * 0.5); g.lineTo(w, h * 0.86); g.lineTo(w * 0.95, h * 0.5); g.fill();
    g.filter = 'blur(1.2px)'; g.drawImage(c, 0, 0); g.filter = 'none';
    return c;
  },
  // 歯飾り（デンティル）
  dentil(w = 128, h = 64) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, w, h); g.fillStyle = '#d0d0d0'; g.fillRect(w * 0.14, h * 0.08, w * 0.72, h * 0.84);
    g.filter = 'blur(1.5px)'; g.drawImage(c, 0, 0); g.filter = 'none'; return c;
  },
  // 唐草（ランソー）帯: アカンサスの渦を正弦で連ねる
  rinceau(w = 512, h = 128, seed = 3) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); const r = rng(seed);
    g.fillStyle = '#262626'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#a0a0a0'; g.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      g.lineWidth = pass ? h * 0.05 : h * 0.09; g.strokeStyle = pass ? '#e8e8e8' : '#8a8a8a';
      g.beginPath(); for (let x = -10; x <= w + 10; x += 4) { const y = h * 0.5 + Math.sin(x / w * Math.PI * 4) * h * 0.22; x < 0 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke();
      for (let k = 0; k < 4; k++) { // 渦巻き
        const cx = (k + 0.25) * w / 4, up = k % 2 ? 1 : -1, cy = h * 0.5 + up * h * 0.05;
        g.beginPath(); for (let a = 0; a < Math.PI * 3.2; a += 0.12) { const rr = h * 0.3 * (1 - a / (Math.PI * 3.6)); const x = cx + Math.cos(a * up) * rr, y = cy + Math.sin(a) * rr * up; a === 0 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke();
      }
    }
    for (let k = 0; k < 16; k++) blob(g, r() * w, h * (0.2 + r() * 0.6), h * 0.06, h * 0.04, 0.8, 0);
    g.fillStyle = '#5a5a5a'; g.fillRect(0, 0, w, h * 0.07); g.fillRect(0, h * 0.93, w, h * 0.07);
    g.filter = 'blur(1.4px)'; g.drawImage(c, 0, 0); g.filter = 'none'; return c;
  },
  // 格間（コファー）＋中央ロゼット: 正方タイル
  coffer(s = 512) {
    const c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d');
    g.fillStyle = '#e0e0e0'; g.fillRect(0, 0, s, s); // 格子（高い）
    for (let k = 0; k < 6; k++) { const inset = s * (0.09 + k * 0.035); const v = 200 - k * 30; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(inset, inset, s - inset * 2, s - inset * 2); } // 段々に凹む
    // ロゼット
    for (let p = 0; p < 12; p++) { const a = p / 12 * Math.PI * 2; blob(g, s / 2 + Math.cos(a) * s * 0.1, s / 2 + Math.sin(a) * s * 0.1, s * 0.07, s * 0.07, 0.9, 0); }
    blob(g, s / 2, s / 2, s * 0.07, s * 0.07, 1, 0.3);
    g.filter = 'blur(2px)'; g.drawImage(c, 0, 0); g.filter = 'none'; return c;
  },
  // ダマスク（絹の織り柄）: 高さ場（明=浮き織り）— 壁布に使う
  damask(s = 512, seed = 5) {
    const c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d'); const r = rng(seed);
    g.fillStyle = '#404040'; g.fillRect(0, 0, s, s);
    const motif = (cx, cy, sc) => {
      g.save(); g.translate(cx, cy); g.scale(sc, sc);
      g.fillStyle = '#b8b8b8';
      // 中心の柘榴（ポメグラネート）モチーフ: 左右対称の葉
      for (const m of [1, -1]) {
        g.beginPath(); g.moveTo(0, -120); g.bezierCurveTo(m * 70, -110, m * 95, -40, m * 40, 0); g.bezierCurveTo(m * 90, 30, m * 70, 100, 0, 130); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(m * 20, -60); g.bezierCurveTo(m * 110, -90, m * 140, 10, m * 120, 60); g.bezierCurveTo(m * 90, 20, m * 60, -10, m * 20, -20); g.fill();
      }
      g.fillStyle = '#e8e8e8'; g.beginPath(); g.ellipse(0, 10, 26, 40, 0, 0, 7); g.fill();
      g.fillStyle = '#7a7a7a'; for (let k = 0; k < 7; k++) { g.beginPath(); g.arc(0, -30 + k * 14, 4, 0, 7); g.fill(); }
      g.restore();
    };
    for (const [x, y] of [[0.5, 0.25], [0, 0.75], [1, 0.75], [0.5, 1.25], [0.5, -0.75], [0, -0.25], [1, -0.25]]) motif(x * s, y * s, s / 560);
    // 斜め綾織の地紋
    g.globalAlpha = 0.08; g.strokeStyle = '#fff'; g.lineWidth = 1; for (let k = -s; k < s * 2; k += 4) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + s, s); g.stroke(); } g.globalAlpha = 1;
    g.filter = 'blur(0.8px)'; g.drawImage(c, 0, 0); g.filter = 'none'; return c;
  },
};

export function canvasTexture(canvas, { srgb = false, repeat, aniso = 8, renderer } = {}) {
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; if (repeat) t.repeat.set(repeat[0], repeat[1] ?? repeat[0]);
  t.anisotropy = Math.min(aniso, renderer?.capabilities?.getMaxAnisotropy?.() || 8); t.needsUpdate = true; return t;
}

// ───────────────────────── マテリアル ─────────────────────────
/** CC0 PBR フォルダからマテリアル（ロード失敗時は色だけで続行） */
export async function pbrMat(ctx, dir, { tile = 2, color = 0xffffff, rough = 1, metal = 0, physical = false, normalScale = 1, extra = {} } = {}) {
  let tx = {};
  try { tx = await ctx.assets.pbr(dir, { repeat: [1 / tile, 1 / tile] }); } catch (e) { console.warn('[museum_c] pbr', dir, e); }
  const M = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new M({ color, roughness: rough, metalness: metal, ...tx, ...extra });
  if (tx.metalnessMap && metal === 0) m.metalnessMap = null; // arm の B は金属度。石・木は 0 固定
  if (tx.aoMap && !extra.aoMap) m.aoMap = null;              // 掃引 UV では AO がずれるので使わない
  if (m.normalMap) m.normalScale.set(normalScale, normalScale);
  return m;
}
/** 金箔（研磨部と艶消し部の揺らぎ）。relief を渡すと浮彫の法線と凹部の黒ずみ */
export function giltMat(ctx, { relief, repeat = [1, 1], color = 0xd4af37, rough = 0.3, normalScale = 1.2 } = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: rough, clearcoat: 0.15, clearcoatRoughness: 0.4, envMapIntensity: 1.25 });
  if (relief) {
    m.normalMap = canvasTexture(heightToNormal(relief, 3), { repeat, renderer: ctx.renderer }); m.normalScale.set(normalScale, normalScale);
    m.map = canvasTexture(heightToCavity(relief, '#ffffff', 0.5), { srgb: true, repeat, renderer: ctx.renderer });
  }
  return m;
}

// ───────────────────────── 文字（刻字・金文字） ─────────────────────────
export function letterCanvas(lines, w = 1024, h = 256, bg = null) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  for (const L of lines) {
    g.font = L.font; g.textBaseline = 'middle'; g.textAlign = L.align || 'center';
    if ('letterSpacing' in g) g.letterSpacing = `${L.spacing || 0}px`;
    if (L.shadow) { g.fillStyle = L.shadow; g.fillText(L.text, (L.x ?? w / 2) + 2, L.y + 3); }
    g.fillStyle = L.color || '#3b352e'; g.fillText(L.text, L.x ?? w / 2, L.y);
  }
  return c;
}

/** InstancedMesh を transform 配列から */
export function instanced(geo, mat, mats4, { cast = true, recv = true } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, mats4.length); mats4.forEach((m, i) => im.setMatrixAt(i, m));
  im.castShadow = cast; im.receiveShadow = recv; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere?.(); return im;
}
/** 旋盤（Lathe）: [[r,y],...] */
export const lathe = (pts, seg = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), seg);
/** 古典的な柱礎＋柱身＋柱頭の手摺子・台座プロファイル */
export const PEDESTAL = [[0, 0], [0.26, 0], [0.26, 0.06], [0.24, 0.07], [0.24, 0.1], [0.2, 0.12], [0.18, 0.16], [0.17, 0.2], [0.17, 0.9], [0.18, 0.92], [0.2, 0.95], [0.22, 0.97], [0.24, 0.98], [0.24, 1.04], [0.26, 1.05], [0.26, 1.1], [0, 1.1]];
