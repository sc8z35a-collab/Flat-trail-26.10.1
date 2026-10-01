// exhibit.js — Owner: B（実エージェント）
// 非ネオンの「現代美術館の一区画」: 額装された生成絵画（真鍮/木の面取り額＋マット＋低反射ガラス）、
// 壁面キャプション（ヴィニール文字風）、白いプリンス（台座）と回転台に載る彫刻（真鍮/ブロンズ/大理石/御影石 PBR）、
// 真鍮のキャプションプレート、真鍮スタンションとベルベットロープ、壁の光だまり・接地影（AO偽装）。
//
// 配置契約（C と合意）: group 原点=床面、ローカル +Z = 通路（来館者）側、-Z = 壁。壁面は z=-0.55。
// 占有 x∈[-1.7,1.7], z∈[-0.55,1.0], y∈[0,3.4]。SpotLight は作らない（museum.js のライトプールが focus を照らす）。
//
// 性能設計:
//  - 高解像度 CanvasTexture は「カメラ近傍の展示だけ」遅延生成し、1フレーム1枚のキューで生成（GCスパイク/ヒッチ防止）。
//    遠ざかって数秒たつと dispose し、ビルド時に作った低解像度版へ戻す（GPUメモリ常時 ~6展示分）。
//  - map は常に定義済み（placeholder→差し替え）なのでシェーダ再コンパイルは発生しない。
//  - ジオメトリ/マテリアルは全展示で共有。距離LODで細部メッシュを非表示にしドローコールを削減。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const F_JP = '"Noto Serif JP","Hiragino Mincho ProN","Yu Mincho",serif';
const F_EN = '"Cormorant Garamond","Times New Roman",serif';
const F_SANS = '"Inter","Helvetica Neue",Arial,sans-serif';

// ---------- レイアウト定数（ローカル座標, m） ----------
const WALL_Z = -0.55;
const ART_W = 1.3, ART_H = 0.975;          // 絵画 4:3
const MAT = 0.12, FRAME = 0.075, FRAME_D = 0.06;
const ART_X = -0.2, ART_Y = 1.7;
const TEXT_X = 1.17, TEXT_Y = 1.72, TEXT_W = 0.95, TEXT_H = 1.2;
const PED_X = -1.36, PED_Z = 0.28, PED_H = 1.0, PED_W = 0.44;
const NEAR_LOAD = 19, FAR_UNLOAD = 27, LOD_MID = 20, LOD_FAR = 46;

// ---------- 乱数 ----------
function rng(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashStr = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// ---------- 色: どんな入力色でも「非ネオン」に矯正（彩度≦0.38, 明度0.32〜0.55） ----------
function museumColor(hex) {
  const c = new THREE.Color(hex || '#9a7b52');
  const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(hsl.s, 0.38), THREE.MathUtils.clamp(hsl.l, 0.32, 0.55));
  return c;
}
const css = (c, a = 1) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
const PALETTE = { paper: '#efe9dd', linen: '#e6dccb', ink: '#24201c', umber: '#5b4634', ochre: '#b38a4a', sienna: '#9c5a3c', slate: '#56606b', gold: '#c6a15b', cream: '#f6f1e7' };

// ---------- 共有テクスチャ ----------
let GRAIN = null;
function grainCanvas() {
  if (GRAIN) return GRAIN;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); const id = g.createImageData(S, S); const r = rng(7);
  for (let i = 0; i < S * S; i++) {
    const x = i % S, y = (i / S) | 0;
    const weave = (Math.sin(x * 1.9) * 0.5 + Math.sin(y * 2.1) * 0.5) * 10; // リネンの織り目
    const v = 128 + (r() - 0.5) * 60 + weave;
    id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255;
  }
  g.putImageData(id, 0, 0); GRAIN = c; return c;
}
function applyGrain(g, W, H, alpha = 0.22) {
  g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = alpha;
  g.fillStyle = g.createPattern(grainCanvas(), 'repeat'); g.fillRect(0, 0, W, H); g.restore();
}
function radialTexture(inner, outer, size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner); gr.addColorStop(0.55, inner.replace(/[\d.]+\)$/, m => (parseFloat(m) * 0.45) + ')')); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function marbleTexture() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = '#f1eee8'; g.fillRect(0, 0, S, S);
  const r = rng(11);
  for (let k = 0; k < 26; k++) { // 石目（ベイン）
    g.beginPath(); let x = r() * S, y = 0; g.moveTo(x, y);
    while (y < S) { x += (r() - 0.5) * 38; y += 10 + r() * 16; g.lineTo(x, y); }
    g.strokeStyle = `rgba(${90 + r() * 40},${88 + r() * 40},${86 + r() * 40},${0.05 + r() * 0.22})`;
    g.lineWidth = 0.6 + r() * (k < 4 ? 5 : 1.6); g.stroke();
  }
  applyGrain(g, S, S, 0.08);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// ---------- 共有マテリアル（遅延生成） ----------
let M = null;
function mats() {
  if (M) return M;
  const marbleMap = marbleTexture();
  M = {
    brass: new THREE.MeshPhysicalMaterial({ color: 0xc9a25e, metalness: 1, roughness: 0.24, clearcoat: 0.3, clearcoatRoughness: 0.2 }),
    brushedBrass: new THREE.MeshStandardMaterial({ color: 0xb48d52, metalness: 1, roughness: 0.42 }),
    bronze: new THREE.MeshPhysicalMaterial({ color: 0x7a5636, metalness: 1, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.35 }),
    patina: new THREE.MeshStandardMaterial({ color: 0x5f7a6c, metalness: 0.6, roughness: 0.62 }),
    marble: new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: marbleMap, roughness: 0.22, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.18 }),
    granite: new THREE.MeshPhysicalMaterial({ color: 0x1d1c1b, roughness: 0.3, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.12 }),
    ceramic: new THREE.MeshPhysicalMaterial({ color: 0xf4f1ea, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 }),
    plinth: new THREE.MeshStandardMaterial({ color: 0xf2efe9, roughness: 0.82, metalness: 0 }),
    plinthGap: new THREE.MeshBasicMaterial({ color: 0x14110e }),
    walnut: new THREE.MeshPhysicalMaterial({ color: 0x3b2a1e, roughness: 0.48, clearcoat: 0.6, clearcoatRoughness: 0.3 }),
    oak: new THREE.MeshPhysicalMaterial({ color: 0xb89a74, roughness: 0.6, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
    blackFrame: new THREE.MeshPhysicalMaterial({ color: 0x151413, roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
    gilt: new THREE.MeshPhysicalMaterial({ color: 0xd2ac62, metalness: 1, roughness: 0.3, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
    mat: new THREE.MeshStandardMaterial({ color: 0xf5f1e8, roughness: 0.95 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.07, envMapIntensity: 1.6, depthWrite: false }),
    velvet: new THREE.MeshPhysicalMaterial({ color: 0x5a1e22, roughness: 0.9, sheen: 1, sheenColor: new THREE.Color(0xc0757a), sheenRoughness: 0.4 }),
    contact: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false, alphaMap: radialTexture('rgba(255,255,255,1)', 'rgba(0,0,0,0)', 128) }),
  };
  M.contact.alphaMap.colorSpace = THREE.NoColorSpace;
  return M;
}

// ---------- 共有ジオメトリ ----------
let G = null;
function geos() {
  if (G) return G;
  const ow = ART_W + MAT * 2 + FRAME * 2, oh = ART_H + MAT * 2 + FRAME * 2;
  const iw = ART_W + MAT * 2, ih = ART_H + MAT * 2;
  const shape = new THREE.Shape(); shape.moveTo(-ow / 2, -oh / 2); shape.lineTo(ow / 2, -oh / 2); shape.lineTo(ow / 2, oh / 2); shape.lineTo(-ow / 2, oh / 2); shape.closePath();
  const hole = new THREE.Path(); hole.moveTo(-iw / 2, -ih / 2); hole.lineTo(-iw / 2, ih / 2); hole.lineTo(iw / 2, ih / 2); hole.lineTo(iw / 2, -ih / 2); hole.closePath();
  shape.holes.push(hole);
  const frame = new THREE.ExtrudeGeometry(shape, { depth: FRAME_D - 0.02, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 1 });
  frame.computeVertexNormals();
  // スタンションのロープ（懸垂線）
  const ropeCurve = new THREE.CatmullRomCurve3([-1.15, -0.6, 0, 0.6, 1.15].map((x) => new THREE.Vector3(x, 0.86 - 0.16 * (1 - (x / 1.15) ** 2), 0)));
  G = {
    frame,
    mat: new THREE.PlaneGeometry(iw, ih),
    art: new THREE.PlaneGeometry(ART_W, ART_H),
    glass: new THREE.PlaneGeometry(iw, ih),
    text: new THREE.PlaneGeometry(TEXT_W, TEXT_H),
    pool: new THREE.PlaneGeometry(2.9, 2.5),
    plinth: new RoundedBoxGeometry(PED_W, PED_H - 0.03, PED_W, 2, 0.008),
    plinthGap: new THREE.BoxGeometry(PED_W - 0.03, 0.03, PED_W - 0.03),
    turntable: new THREE.CylinderGeometry(0.16, 0.17, 0.018, 48),
    plaque: new RoundedBoxGeometry(0.3, 0.1, 0.008, 2, 0.003),
    contact: new THREE.PlaneGeometry(1, 1),
    post: new THREE.LatheGeometry([[0, 0], [0.12, 0], [0.13, 0.012], [0.05, 0.03], [0.018, 0.06], [0.016, 0.86], [0.03, 0.88], [0.032, 0.92], [0.022, 0.95], [0, 0.96]].map(([x, y]) => new THREE.Vector2(x, y)), 28),
    rope: new THREE.TubeGeometry(ropeCurve, 40, 0.017, 10, false),
  };
  return G;
}

// ---------- 和文折返し（簡易禁則） ----------
const NO_START = '、。，．・：；？！）」』】〕ーぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ％';
function wrap(g, text, maxW) {
  const lines = []; let line = '';
  const chars = [...String(text || '')];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]; const t = line + ch;
    if (g.measureText(t).width > maxW && line) {
      if (NO_START.includes(ch)) { line = t; continue; } // ぶら下げ
      // 英単語の途中で切らない
      if (/[A-Za-z0-9.]/.test(ch) && /[A-Za-z0-9.]$/.test(line)) {
        const m = line.match(/[A-Za-z0-9.\-]+$/);
        if (m && m[0].length < line.length) { lines.push(line.slice(0, -m[0].length)); line = m[0] + ch; continue; }
      }
      lines.push(line); line = ch;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
function clampLines(lines, n) {
  if (lines.length <= n) return lines;
  const out = lines.slice(0, n); out[n - 1] = out[n - 1].replace(/.$/, '…'); return out;
}

// ---------- 生成絵画（カテゴリ別の作風、シードで一点物） ----------
const STYLE = {
  MODEL: 'network', AGENT: 'network', OPEN: 'strata', SCIENCE: 'strata', RESEARCH: 'strata', VOICE: 'waves',
  COMPUTE: 'grid', DEVICE: 'grid', SAFETY: 'kintsugi', SECURITY: 'kintsugi', POLICY: 'enso', LAW: 'enso',
  INDUSTRY: 'field', SOCIETY: 'field', CONSUMER: 'field', VIDEO: 'field',
};
function paintArt(g, W, H, n, index, accent) {
  const r = rng(hashStr(n.title) + index * 977);
  const style = STYLE[n.category] || ['field', 'network', 'strata', 'enso', 'grid', 'kintsugi'][index % 6];
  const s = W / 1024; // スケール係数（低解像度版でも同じ構図）
  // 下地
  const base = style === 'kintsugi' ? '#1f1d1b' : (style === 'grid' ? PALETTE.cream : PALETTE.linen);
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  const acc = css(accent), accSoft = css(accent, 0.55);

  const brushRect = (x, y, w, h, color, passes = 40) => { // 刷毛の重ね塗り
    for (let i = 0; i < passes; i++) {
      g.globalAlpha = 0.05 + r() * 0.06; g.fillStyle = color;
      const jx = (r() - 0.5) * 18 * s, jy = (r() - 0.5) * 14 * s;
      g.beginPath(); g.ellipse(x + w / 2 + jx, y + h / 2 + jy, w / 2 * (0.94 + r() * 0.08), h / 2 * (0.9 + r() * 0.12), 0, 0, Math.PI * 2); g.fill();
      g.fillRect(x + jx + w * 0.04, y + jy + h * 0.06, w * 0.92, h * 0.88);
    }
    g.globalAlpha = 1;
  };

  if (style === 'field') { // ロスコ的カラーフィールド
    g.fillStyle = PALETTE.umber; g.globalAlpha = 0.25; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
    const split = 0.42 + r() * 0.16;
    brushRect(W * 0.08, H * 0.07, W * 0.84, H * (split - 0.1), acc, 46);
    brushRect(W * 0.08, H * (split + 0.03), W * 0.84, H * (0.9 - split), r() > 0.5 ? PALETTE.ochre : PALETTE.sienna, 46);
    brushRect(W * 0.1, H * (split - 0.035), W * 0.8, H * 0.05, PALETTE.ink, 18);
  } else if (style === 'network') { // 黒鉛のネットワーク（ニューラル網の素描）
    const pts = []; const N = 70;
    for (let i = 0; i < N; i++) { const a = r() * Math.PI * 2, d = Math.pow(r(), 0.6) * 0.42; pts.push([W * (0.5 + Math.cos(a) * d * 1.25), H * (0.5 + Math.sin(a) * d)]); }
    g.strokeStyle = PALETTE.ink; g.lineCap = 'round';
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1], d = Math.hypot(dx, dy);
      if (d < 150 * s && r() > 0.35) { g.globalAlpha = 0.12 + (1 - d / (150 * s)) * 0.35; g.lineWidth = (0.6 + r()) * s; g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[j][0], pts[j][1]); g.stroke(); }
    }
    g.globalAlpha = 1;
    pts.forEach(([x, y], i) => { g.fillStyle = i % 9 === 0 ? acc : PALETTE.ink; g.beginPath(); g.arc(x, y, (i % 9 === 0 ? 7 : 2 + r() * 2.5) * s, 0, Math.PI * 2); g.fill(); });
    // 金箔の円
    g.fillStyle = PALETTE.gold; g.globalAlpha = 0.85; g.beginPath(); g.arc(W * (0.2 + r() * 0.6), H * (0.25 + r() * 0.5), 26 * s, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
  } else if (style === 'strata' || style === 'waves') { // 等高線・地層 / 音の波形
    const bands = style === 'waves' ? 46 : 34; const f1 = 1 + r() * 2, f2 = 2 + r() * 4, ph = r() * 9;
    for (let k = 0; k < bands; k++) {
      const y0 = H * (0.1 + 0.8 * k / bands);
      g.beginPath();
      for (let x = 0; x <= W; x += 6 * s) {
        const u = x / W;
        const env = style === 'waves' ? Math.exp(-Math.pow((u - 0.5) * 3.2, 2)) * Math.sin(k * 0.5 + ph) : 1;
        const y = y0 + (Math.sin(u * Math.PI * f1 + k * 0.21 + ph) * 26 + Math.sin(u * Math.PI * f2 * 2 + k * 0.13) * 9) * s * (style === 'waves' ? env * 3 : 1);
        x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.strokeStyle = k % 7 === 3 ? acc : PALETTE.umber; g.globalAlpha = k % 7 === 3 ? 0.9 : 0.35; g.lineWidth = (k % 7 === 3 ? 3 : 1.2) * s; g.stroke();
    }
    g.globalAlpha = 1;
  } else if (style === 'grid') { // アグネス・マーティン的グリッド＋金箔一枡
    g.fillStyle = accSoft; g.globalAlpha = 0.22; g.fillRect(W * 0.06, H * 0.08, W * 0.88, H * 0.84); g.globalAlpha = 1;
    const cols = 16, rows = 12; const gx = W * 0.08, gy = H * 0.1, gw = W * 0.84, gh = H * 0.8;
    g.strokeStyle = PALETTE.slate; g.lineWidth = 1 * s;
    for (let i = 0; i <= cols; i++) { g.globalAlpha = 0.25 + r() * 0.2; g.beginPath(); g.moveTo(gx + gw * i / cols + (r() - 0.5) * 1.5 * s, gy); g.lineTo(gx + gw * i / cols + (r() - 0.5) * 1.5 * s, gy + gh); g.stroke(); }
    for (let j = 0; j <= rows; j++) { g.globalAlpha = 0.25 + r() * 0.2; g.beginPath(); g.moveTo(gx, gy + gh * j / rows); g.lineTo(gx + gw, gy + gh * j / rows); g.stroke(); }
    g.globalAlpha = 1;
    const ci = 2 + ((r() * (cols - 4)) | 0), cj = 1 + ((r() * (rows - 2)) | 0);
    g.fillStyle = PALETTE.gold; g.fillRect(gx + gw * ci / cols + 2 * s, gy + gh * cj / rows + 2 * s, gw / cols - 4 * s, gh / rows - 4 * s);
    for (let k = 0; k < 18; k++) { const i = (r() * cols) | 0, j = (r() * rows) | 0; g.fillStyle = PALETTE.ink; g.globalAlpha = 0.6; g.fillRect(gx + gw * (i + 0.5) / cols - 2 * s, gy + gh * (j + 0.5) / rows - 2 * s, 4 * s, 4 * s); }
    g.globalAlpha = 1;
  } else if (style === 'kintsugi') { // 黒釉に金継ぎ（破断と修復）
    const gr = g.createRadialGradient(W * 0.45, H * 0.4, 10, W * 0.5, H * 0.5, W * 0.7); gr.addColorStop(0, '#3a3530'); gr.addColorStop(1, '#141210');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const crack = (x, y, a, len, w, depth) => {
      g.beginPath(); g.moveTo(x, y);
      for (let i = 0; i < len; i++) { a += (r() - 0.5) * 0.7; x += Math.cos(a) * 14 * s; y += Math.sin(a) * 14 * s; g.lineTo(x, y);
        if (depth < 2 && r() < 0.07) { g.stroke(); crack(x, y, a + (r() - 0.5) * 2, len * 0.5 | 0, w * 0.6, depth + 1); g.beginPath(); g.moveTo(x, y); } }
      g.lineWidth = w * s; g.strokeStyle = PALETTE.gold; g.lineCap = 'round'; g.stroke();
    };
    for (let k = 0; k < 4; k++) crack(W * (0.15 + r() * 0.7), H * (r() < 0.5 ? 0.02 : 0.98), r() < 0.5 ? Math.PI / 2 : -Math.PI / 2, 40, 4 + r() * 3, 0);
    g.fillStyle = acc; g.globalAlpha = 0.25; g.beginPath(); g.arc(W * 0.5, H * 0.5, H * 0.3, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
  } else if (style === 'enso') { // 円相＋朱印
    for (let p = 0; p < 3; p++) {
      const cx = W * 0.47, cy = H * 0.5, R = H * 0.31; const a0 = -0.9 + r() * 0.3, a1 = a0 + Math.PI * 1.85;
      for (let a = a0; a < a1; a += 0.012) {
        const t = (a - a0) / (a1 - a0); const w = (34 - t * 24 + (r() - 0.5) * 6) * s; // かすれ
        if (r() < t * 0.35) continue;
        g.fillStyle = PALETTE.ink; g.globalAlpha = 0.08 + (1 - t) * 0.12;
        g.beginPath(); g.arc(cx + Math.cos(a) * R + (r() - 0.5) * 4 * s, cy + Math.sin(a) * R + (r() - 0.5) * 4 * s, w / 2, 0, Math.PI * 2); g.fill();
      }
    }
    g.globalAlpha = 1;
    g.fillStyle = '#9b3a2e'; const sx = W * 0.8, sy = H * 0.72; g.fillRect(sx, sy, 62 * s, 62 * s);
    g.fillStyle = PALETTE.linen; g.font = `900 ${22 * s}px ${F_JP}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const d = String(n.date || '').replace(/^\d{4}[.-]/, '').split(/[.-]/); g.fillText(d[0] || '', sx + 31 * s, sy + 19 * s); g.fillText(d[1] || '', sx + 31 * s, sy + 43 * s);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }
  // 署名（右下・鉛筆）
  g.fillStyle = style === 'kintsugi' ? 'rgba(230,220,200,0.55)' : 'rgba(40,34,28,0.55)';
  g.font = `italic 400 ${20 * s}px ${F_EN}`; g.textAlign = 'right';
  g.fillText(`${n.date || ''} — FT ${String(index + 1).padStart(2, '0')}`, W - 26 * s, H - 22 * s); g.textAlign = 'left';
  applyGrain(g, W, H, style === 'kintsugi' ? 0.12 : 0.26);
  // 縁の焼け（ヴィネット）
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.72); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,40,20,0.18)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
}

// ---------- 壁面キャプション（透明背景・墨色の文字） ----------
function paintWallText(g, W, H, n, index, accent) {
  g.clearRect(0, 0, W, H);
  const s = W / 1024, L = 18 * s; let y = 40 * s;
  g.textBaseline = 'top'; g.fillStyle = '#6d6257';
  g.font = `600 ${22 * s}px ${F_SANS}`; if ('letterSpacing' in g) g.letterSpacing = `${6 * s}px`;
  g.fillText(`No. ${String(index + 1).padStart(2, '0')}   ${(n.category || '').toUpperCase()}`, L, y);
  if ('letterSpacing' in g) g.letterSpacing = '0px';
  y += 46 * s;
  g.fillStyle = '#2a2520'; g.font = `500 ${118 * s}px ${F_EN}`;
  g.fillText(String(n.date || '').replace(/-/g, '.'), L - 4 * s, y); y += 136 * s;
  g.fillStyle = css(accent); g.fillRect(L, y, 120 * s, 5 * s); y += 34 * s;
  g.fillStyle = '#1f1b17'; g.font = `900 ${64 * s}px ${F_JP}`;
  clampLines(wrap(g, n.title, W - L * 2), 3).forEach((l) => { g.fillText(l, L, y); y += 84 * s; });
  y += 2 * s;
  if (n.titleEn) { g.fillStyle = '#4a4239'; g.font = `italic 500 ${38 * s}px ${F_EN}`; clampLines(wrap(g, n.titleEn, W - L * 2), 2).forEach((l) => { g.fillText(l, L, y); y += 46 * s; }); }
  y += 14 * s;
  if (n.org) { g.fillStyle = '#7a6d60'; g.font = `600 ${22 * s}px ${F_SANS}`; if ('letterSpacing' in g) g.letterSpacing = `${4 * s}px`; g.fillText(String(n.org).toUpperCase(), L, y); if ('letterSpacing' in g) g.letterSpacing = '0px'; y += 50 * s; }
  if (n.summary) { g.fillStyle = '#3a332c'; g.font = `400 ${30 * s}px ${F_JP}`; clampLines(wrap(g, n.summary, W - L * 2), Math.max(2, Math.floor((H - y - 90 * s) / (50 * s)))).forEach((l) => { g.fillText(l, L, y); y += 50 * s; }); }
  if (n.impact) { g.fillStyle = '#6d6257'; g.font = `italic 500 ${28 * s}px ${F_EN}`; g.fillText(`— ${n.impact}`, L, H - 70 * s); }
  g.textBaseline = 'alphabetic';
}

// ---------- 真鍮プレート（刻印） ----------
function paintPlaque(g, W, H, n, index) {
  const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#d8b779'); gr.addColorStop(0.5, '#b8924f'); gr.addColorStop(1, '#cfae6e');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 140; i++) { g.strokeStyle = `rgba(255,240,210,${Math.random() * 0.12})`; g.beginPath(); const y = Math.random() * H; g.moveTo(0, y); g.lineTo(W, y + (Math.random() - 0.5) * 2); g.stroke(); } // ヘアライン
  const s = W / 512;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const engrave = (text, y, font) => { g.font = font; g.fillStyle = 'rgba(255,240,205,0.55)'; g.fillText(text, W / 2 + 1, y + 1.5); g.fillStyle = '#3a2a15'; g.fillText(text, W / 2, y); };
  engrave(`FLAT TRAIL · No.${String(index + 1).padStart(2, '0')}`, H * 0.34, `600 ${26 * s}px ${F_EN}`);
  engrave(`${(n.org || '').slice(0, 30)}`, H * 0.68, `500 ${21 * s}px ${F_SANS}`);
}

// ---------- テクスチャ生成ヘルパ ----------
function canvasTex(w, h, painter, renderer) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  painter(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  return t;
}
// 高解像度ジョブキュー: 1フレーム1件。フォント（使用文字のサブセット）を先に読み込む。
const queue = []; let busy = false; let lastPumpT = -1;
const fontCache = new Map();
function ensureFonts(text) {
  if (!document.fonts?.load) return Promise.resolve();
  const key = text; if (fontCache.has(key)) return fontCache.get(key);
  const p = Promise.race([
    Promise.all([`900 64px ${F_JP}`, `400 30px ${F_JP}`, `500 64px ${F_EN}`, `italic 500 38px ${F_EN}`, `600 22px ${F_SANS}`].map((f) => document.fonts.load(f, text).catch(() => {}))),
    new Promise((r) => setTimeout(r, 2500)),
  ]);
  fontCache.set(key, p); return p;
}
function pump(t) {
  if (t === lastPumpT || busy || !queue.length) return; lastPumpT = t;
  // 最も近い展示を優先
  queue.sort((a, b) => a.dist() - b.dist());
  const job = queue.shift(); busy = true;
  job.run().catch((e) => console.warn('[exhibit] texture job failed', e)).finally(() => { busy = false; });
}

// ---------- 彫刻（カテゴリ別、全て PBR 実体） ----------
const sculptGeoCache = {};
const cached = (k, f) => (sculptGeoCache[k] ??= f());
function inst(geo, mat, n, setter) {
  const m = new THREE.InstancedMesh(geo, mat, n); const o = new THREE.Object3D();
  for (let i = 0; i < n; i++) { setter(o, i); o.updateMatrix(); m.setMatrixAt(i, o.matrix); }
  m.instanceMatrix.needsUpdate = true; m.castShadow = true; return m;
}
function makeSculpture(category) {
  const m = mats(); const g = new THREE.Group();
  const add = (mesh) => { mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh; };
  switch (category) {
    case 'MODEL': {
      const k = add(new THREE.Mesh(cached('knot', () => new THREE.TorusKnotGeometry(0.13, 0.038, 220, 28, 2, 3)), m.brass)); k.position.y = 0.24; g.userData.spin = k; break;
    }
    case 'OPEN': {
      const box = cached('cube', () => new RoundedBoxGeometry(0.07, 0.07, 0.07, 2, 0.008));
      add(inst(box, m.marble, 16, (o, i) => { const a = i * 0.62, y = 0.05 + i * 0.03; o.position.set(Math.cos(a) * 0.12, y, Math.sin(a) * 0.12); o.rotation.set(i * 0.4, a, i * 0.2); }));
      break;
    }
    case 'INDUSTRY': {
      const tor = cached('ring', () => new THREE.TorusGeometry(0.11, 0.022, 24, 96));
      const a = add(new THREE.Mesh(tor, m.brass)); a.position.set(-0.05, 0.2, 0); a.rotation.y = 0.5;
      const b = add(new THREE.Mesh(tor, m.bronze)); b.position.set(0.05, 0.2, 0); b.rotation.set(Math.PI / 2, 0.5, 0);
      break;
    }
    case 'COMPUTE': {
      const slab = cached('slab', () => new RoundedBoxGeometry(0.26, 0.036, 0.26, 2, 0.006));
      const plate = cached('plate', () => new THREE.BoxGeometry(0.2, 0.006, 0.2));
      add(inst(slab, m.granite, 7, (o, i) => { o.position.y = 0.03 + i * 0.05; o.rotation.y = i * 0.13; }));
      add(inst(plate, m.brass, 6, (o, i) => { o.position.y = 0.055 + i * 0.05; o.rotation.y = i * 0.13 + 0.06; }));
      break;
    }
    case 'SAFETY': {
      const s = add(new THREE.Mesh(cached('sph', () => new THREE.SphereGeometry(0.095, 48, 32)), m.marble)); s.position.y = 0.2;
      const ico = new THREE.IcosahedronGeometry(0.17, 0); const e = new THREE.EdgesGeometry(ico); const p = e.attributes.position;
      const rod = cached('rod', () => new THREE.CylinderGeometry(0.004, 0.004, 1, 6));
      const A = new THREE.Vector3(), B = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      add(inst(rod, m.brass, p.count / 2, (o, i) => {
        A.fromBufferAttribute(p, i * 2); B.fromBufferAttribute(p, i * 2 + 1);
        o.position.copy(A).add(B).multiplyScalar(0.5); o.position.y += 0.2; o.scale.set(1, A.distanceTo(B), 1);
        o.quaternion.setFromUnitVectors(up, B.sub(A).normalize());
      }));
      ico.dispose(); e.dispose(); break;
    }
    case 'SECURITY': {
      const half = cached('hemi', () => new THREE.SphereGeometry(0.12, 48, 24, 0, Math.PI));
      const cap = cached('cap', () => new THREE.CircleGeometry(0.12, 48));
      for (const sx of [-1, 1]) {
        const h = new THREE.Group(); h.position.set(sx * 0.016, 0.23, 0); h.scale.set(1, 1.45, 1); h.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2;
        const shell = new THREE.Mesh(half, m.bronze); shell.castShadow = true; h.add(shell);
        const c = new THREE.Mesh(cap, m.marble); c.rotation.y = Math.PI; h.add(c); g.add(h);
      }
      break;
    }
    case 'POLICY': case 'LAW': {
      const post = add(new THREE.Mesh(cached('spost', () => new THREE.CylinderGeometry(0.008, 0.012, 0.42, 16)), m.brass)); post.position.y = 0.21;
      const beam = new THREE.Group(); beam.position.y = 0.42; g.add(beam);
      const bm = new THREE.Mesh(cached('sbeam', () => new THREE.CylinderGeometry(0.006, 0.006, 0.36, 12).rotateZ(Math.PI / 2)), m.brass);
      bm.castShadow = true; beam.add(bm);
      const pan = cached('pan', () => new THREE.LatheGeometry([[0, 0], [0.06, 0.005], [0.075, 0.02], [0.074, 0.022]].map(([x, y]) => new THREE.Vector2(x, y)), 32));
      const str = cached('str', () => new THREE.CylinderGeometry(0.0015, 0.0015, 0.16, 4));
      g.userData.pans = [];
      for (const sx of [-1, 1]) {
        const hang = new THREE.Group(); hang.position.x = sx * 0.17; beam.add(hang);
        const st = new THREE.Mesh(str, m.brass); st.position.y = -0.08; hang.add(st);
        const p = new THREE.Mesh(pan, m.brass); p.position.y = -0.17; p.castShadow = true; hang.add(p);
        g.userData.pans.push(hang);
      }
      const knob = add(new THREE.Mesh(cached('knob', () => new THREE.SphereGeometry(0.014, 16, 12)), m.brass)); knob.position.y = 0.435;
      g.userData.beam = beam; break;
    }
    case 'SOCIETY': case 'CONSUMER': {
      const st = cached('stone', () => new THREE.SphereGeometry(1, 40, 24));
      const spec = [[0.11, 0.05, 0.1, m.granite], [0.085, 0.045, 0.08, m.marble], [0.065, 0.04, 0.06, m.granite], [0.045, 0.035, 0.045, m.marble]];
      let y = 0; spec.forEach(([rx, ry, rz, mat], i) => { const s = add(new THREE.Mesh(st, mat)); y += ry * (i ? 1.85 : 1); s.scale.set(rx, ry, rz); s.position.set((i % 2 ? 0.008 : -0.006), y, 0); s.rotation.y = i * 0.8; y += 0; });
      break;
    }
    case 'DEVICE': {
      const slab = add(new THREE.Mesh(cached('phone', () => new RoundedBoxGeometry(0.17, 0.34, 0.022, 4, 0.02)), m.ceramic)); slab.position.y = 0.2; slab.rotation.x = -0.12;
      const ring = add(new THREE.Mesh(cached('hring', () => new THREE.TorusGeometry(0.03, 0.004, 12, 48)), m.brass)); ring.position.set(0, 0.28, -0.014); ring.rotation.x = -0.12;
      const stand = add(new THREE.Mesh(cached('stand', () => new THREE.BoxGeometry(0.12, 0.03, 0.08)), m.brushedBrass)); stand.position.y = 0.035;
      break;
    }
    case 'SCIENCE': case 'RESEARCH': {
      const bead = cached('bead', () => new THREE.SphereGeometry(0.016, 16, 12));
      const rung = cached('rung', () => new THREE.CylinderGeometry(0.004, 0.004, 1, 6).rotateZ(Math.PI / 2));
      const N = 16;
      add(inst(bead, m.brass, N * 2, (o, i) => { const k = i >> 1, s = i & 1 ? Math.PI : 0; const a = k * 0.5 + s; o.position.set(Math.cos(a) * 0.08, 0.04 + k * 0.026, Math.sin(a) * 0.08); }));
      add(inst(rung, m.marble, N, (o, k) => { const a = k * 0.5; o.position.set(0, 0.04 + k * 0.026, 0); o.rotation.y = -a; o.scale.set(0.16, 1, 1); }));
      break;
    }
    case 'VOICE': {
      const disc = cached('disc', () => new THREE.CylinderGeometry(1, 1, 0.008, 48));
      add(inst(disc, m.brass, 24, (o, i) => { const r = 0.03 + Math.abs(Math.sin(i * 0.55)) * 0.1 * Math.exp(-Math.pow((i - 12) / 9, 2)); o.position.y = 0.02 + i * 0.017; o.scale.set(r, 1, r); }));
      break;
    }
    case 'VIDEO': {
      const ribbon = cached('ribbon', () => {
        const geo = new THREE.BufferGeometry(); const segU = 160, segV = 6; const pos = []; const idx = [];
        for (let i = 0; i <= segU; i++) for (let j = 0; j <= segV; j++) {
          const u = i / segU * Math.PI * 2, v = (j / segV - 0.5) * 0.06;
          const R = 0.12 + v * Math.cos(u * 1.5);
          pos.push(R * Math.cos(u), v * Math.sin(u * 1.5) + Math.sin(u * 2) * 0.03, R * Math.sin(u));
        }
        for (let i = 0; i < segU; i++) for (let j = 0; j < segV; j++) { const a = i * (segV + 1) + j, b = a + segV + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals(); return geo;
      });
      const mat = (m.bronzeDS ??= m.bronze.clone()); mat.side = THREE.DoubleSide;
      const r = add(new THREE.Mesh(ribbon, mat)); r.position.y = 0.22; r.rotation.x = 0.35; g.userData.spin = r; break;
    }
    default: { // AGENT 他: ブランクーシ「空間の鳥」へのオマージュ
      const bird = cached('bird', () => new THREE.LatheGeometry(
        [[0, 0], [0.03, 0], [0.032, 0.02], [0.012, 0.06], [0.01, 0.1], [0.018, 0.16], [0.034, 0.28], [0.046, 0.4], [0.044, 0.5], [0.03, 0.58], [0.012, 0.63], [0, 0.645]]
          .map(([x, y]) => new THREE.Vector2(x, y)), 48));
      const b = add(new THREE.Mesh(bird, m.brass)); b.rotation.z = 0.06; b.scale.set(1, 1, 0.78);
    }
  }
  return g;
}

// ---------- 低解像度の即時テクスチャ ----------
const lowRes = (painter, w, h, renderer) => canvasTex(w, h, painter, renderer);

let camRef = null; // onBeforeRender から取得する描画カメラ（main/museum の改修不要）
const _wp = new THREE.Vector3();

export function makeExhibit(news, index, renderer) {
  const n = news || {}; const m = mats(); const G = geos();
  const accent = museumColor(n.color);
  const group = new THREE.Group(); group.name = `exhibit-${index}`;

  // 壁の光だまり（スポットの当たり）— 通常ブレンド・暖白・低不透明度
  const poolMat = new THREE.MeshBasicMaterial({ map: (makeExhibit._pool ??= radialTexture('rgba(255,244,226,0.9)', 'rgba(255,244,226,0)')), transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false, color: 0xfff1dc });
  const pool = new THREE.Mesh(G.pool, poolMat); pool.position.set(ART_X, ART_Y + 0.1, WALL_Z + 0.004); pool.renderOrder = 1; group.add(pool);

  // 額装
  const frameMat = [m.gilt, m.walnut, m.blackFrame, m.oak, m.brass][hashStr(n.category || index) % 5];
  const art = new THREE.Group(); art.position.set(ART_X, ART_Y, WALL_Z + 0.012); group.add(art);
  const frame = new THREE.Mesh(G.frame, frameMat); frame.castShadow = true; frame.receiveShadow = true; art.add(frame);
  const matBoard = new THREE.Mesh(G.mat, m.mat); matBoard.position.z = 0.012; matBoard.receiveShadow = true; art.add(matBoard);
  const artLo = lowRes((g, w, h) => paintArt(g, w, h, n, index, accent), 160, 120, renderer);
  const artMat = new THREE.MeshStandardMaterial({ map: artLo, roughness: 0.78, metalness: 0 });
  const canvasMesh = new THREE.Mesh(G.art, artMat); canvasMesh.position.z = 0.016; canvasMesh.receiveShadow = true; art.add(canvasMesh);
  const glass = new THREE.Mesh(G.glass, m.glass); glass.position.z = FRAME_D - 0.008; glass.renderOrder = 2; art.add(glass);

  // 壁面キャプション
  const textLo = lowRes((g, w, h) => paintWallText(g, w, h, n, index, accent), 192, 243, renderer);
  const textMat = new THREE.MeshStandardMaterial({ map: textLo, transparent: true, roughness: 0.6, depthWrite: false, alphaTest: 0.02 });
  const wallText = new THREE.Mesh(G.text, textMat); wallText.position.set(TEXT_X, TEXT_Y, WALL_Z + 0.003); wallText.renderOrder = 2; group.add(wallText);

  // 台座＋回転台＋彫刻
  const ped = new THREE.Group(); ped.position.set(PED_X, 0, PED_Z); group.add(ped);
  const plinth = new THREE.Mesh(G.plinth, m.plinth); plinth.position.y = 0.03 + (PED_H - 0.03) / 2; plinth.castShadow = plinth.receiveShadow = true; ped.add(plinth);
  const gap = new THREE.Mesh(G.plinthGap, m.plinthGap); gap.position.y = 0.015; ped.add(gap);
  const turntable = new THREE.Mesh(G.turntable, m.brushedBrass); turntable.position.y = PED_H + 0.009; turntable.receiveShadow = true; ped.add(turntable);
  const sculpt = makeSculpture(n.category); sculpt.position.y = PED_H + 0.018; ped.add(sculpt);
  const plaqueTex = lowRes((g, w, h) => paintPlaque(g, w, h, n, index), 512, 170, renderer);
  const plaque = new THREE.Mesh(G.plaque, new THREE.MeshStandardMaterial({ map: plaqueTex, metalness: 1, roughness: 0.32, color: 0xffffff }));
  plaque.position.set(0, PED_H - 0.16, PED_W / 2 + 0.005); ped.add(plaque);
  const contact = new THREE.Mesh(G.contact, m.contact); contact.rotation.x = -Math.PI / 2; contact.scale.set(0.95, 0.95, 1); contact.position.y = 0.003; ped.add(contact);

  // スタンション＋ベルベットロープ（絵の前）
  const rail = new THREE.Group(); rail.position.set(ART_X, 0, 0.62); group.add(rail);
  for (const sx of [-1.15, 1.15]) { const p = new THREE.Mesh(G.post, m.brass); p.position.x = sx; p.castShadow = true; rail.add(p); }
  const rope = new THREE.Mesh(G.rope, m.velvet); rope.castShadow = true; rail.add(rope);
  const railShadow = new THREE.Mesh(G.contact, m.contact); railShadow.rotation.x = -Math.PI / 2; railShadow.scale.set(2.8, 0.35, 1); railShadow.position.y = 0.002; rail.add(railShadow);

  // ---------- 遅延高解像度テクスチャ ----------
  let hi = null, hiQueued = false, farSince = 0, dist = 1e9;
  const anis = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  const job = {
    dist: () => dist,
    run: async () => {
      await ensureFonts(`${n.title || ''}${n.titleEn || ''}${n.summary || ''}${n.org || ''}${n.impact || ''}${n.date || ''}No.0123456789`);
      if (!hiQueued) return; // 待機中にキャンセル
      const a = canvasTex(1024, 768, (g, w, h) => paintArt(g, w, h, n, index, accent), renderer);
      const t = canvasTex(1024, 1294, (g, w, h) => paintWallText(g, w, h, n, index, accent), renderer);
      a.anisotropy = t.anisotropy = anis;
      hi = { a, t }; artMat.map = a; textMat.map = t; hiQueued = false;
    },
  };
  const requestHi = () => { if (hi || hiQueued) return; hiQueued = true; queue.push(job); };
  const dropHi = () => {
    if (hiQueued) { hiQueued = false; const k = queue.indexOf(job); if (k >= 0) queue.splice(k, 1); }
    if (!hi) return; artMat.map = artLo; textMat.map = textLo; hi.a.dispose(); hi.t.dispose(); hi = null;
  };
  canvasMesh.onBeforeRender = (_r, _s, cam) => { if (!camRef || cam.isPerspectiveCamera) camRef = cam; };

  // ---------- LOD ----------
  const midOnly = [glass, plaque, rail, contact, pool];
  let lod = -1;
  const setLod = (l) => {
    if (l === lod) return; lod = l;
    midOnly.forEach((o) => { o.visible = l === 0; });
    wallText.visible = l <= 1; sculpt.visible = l <= 1; turntable.visible = l <= 1;
  };
  setLod(0);

  let focus = 0, spin = index * 0.7;
  const focusLocal = new THREE.Vector3(ART_X, ART_Y, WALL_Z + 0.03);
  group.userData = {
    news: n, index,
    focus: focusLocal,                                  // 照らす/注視する中心（ローカル）
    focusSculpture: new THREE.Vector3(PED_X, PED_H + 0.3, PED_Z),
    lightColor: new THREE.Color(0xffe8c8),
    lightPos: new THREE.Vector3(ART_X, 3.7, 2.0),        // ライトプールの推奨設置位置（ローカル）
    focusTarget: 0,
    sculpt,                                             // burst 位置などに使用可
    accent,
    dispose() { dropHi(); artLo.dispose(); textLo.dispose(); plaqueTex.dispose(); artMat.dispose(); textMat.dispose(); poolMat.dispose(); },
    update(t, dt) {
      // カメラ距離で LOD / テクスチャ管理
      if (camRef) {
        group.getWorldPosition(_wp); dist = _wp.distanceTo(camRef.position);
        setLod(dist < LOD_MID ? 0 : dist < LOD_FAR ? 1 : 2);
        if (dist < NEAR_LOAD) { requestHi(); farSince = 0; }
        else if (dist > FAR_UNLOAD) { farSince += dt; if (farSince > 3) dropHi(); }
      } else requestHi();
      pump(t);
      // 注視演出（控えめ）: 光だまりが明るくなり、回転台がゆっくり加速
      focus += (this.focusTarget - focus) * Math.min(1, dt * 2.2);
      poolMat.opacity = 0.16 + focus * 0.34;
      spin += dt * (0.12 + focus * 0.22);
      sculpt.rotation.y = spin;
      if (sculpt.userData.spin) sculpt.userData.spin.rotation.x = Math.sin(t * 0.4 + index) * 0.15;
      if (sculpt.userData.beam) {
        const tilt = Math.sin(t * 0.6 + index) * 0.09; sculpt.userData.beam.rotation.z = tilt;
        sculpt.userData.pans.forEach((p) => { p.rotation.z = -tilt; });
      }
    },
  };
  return group;
}
