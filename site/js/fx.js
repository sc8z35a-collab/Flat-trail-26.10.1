// fx.js — Owner: D（実エージェント）
// 「光の美術館」演出レイヤー。ネオン禁止方針に従い、彩度の高い発光は一切使わない。
//   1) 天窓から差す斜めの光芒（ボリュメトリック風シアーボックス / 視線角フェード / 流れる埃ノイズ）
//   2) 床に落ちる光だまり（窓の桟(マリオン)の影・ガラス越しのゆらぎ＝微弱なコースティクス）
//   3) 空気中の埃（Tyndall dust）— カメラ追従ラップ領域のGPU Points。光芒の中に入った粒だけがきらめく
//   4) 到着時の金箔が舞い落ちる演出（InstancedBufferGeometry、回転・ひらひら落下・鏡面グリント）
//   5) 雲の通過による太陽強度のゆらぎ（fx.sun を他モジュールが参照可）
// 全てシェーダ駆動。毎フレームのCPU処理は uniform 更新のみ（GC 0）。
//
// API（INTERFACES.md 互換・拡張）:
//   createFX(scene, renderer, { length, z0, skylights?, hall?, sunOffset?, count? })
//     -> { group, update(t,dt,camera?), burst(pos,color?), setDensity(q), setPixelRatio(pr), setSun(v), finale(on), get sun }
//   fx.sun（0.7〜1.55）は雲の通過による日照係数。museum の太陽光 intensity に掛けると光芒と同期する。
//   skylights: [{ x, y, z, w, d }]（天窓開口中心のワールド座標・x幅・z奥行き。y=天井高）未指定なら自動配置。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const MAXS = 32;
const SUN_COLOR = new THREE.Color('#fff1dc'); // 暖色白（午後の自然光）
const GOLD = new THREE.Color('#c9a25a');

const NOISE = /* glsl */`
  float h31(vec3 p){ p = fract(p*0.3183099 + .1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(h31(i+vec3(0,0,0)),h31(i+vec3(1,0,0)),f.x), mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x), mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y), f.z); }
  float fbm(vec3 p){ float a = 0.5, s = 0.0; for(int i=0;i<4;i++){ s += a*vnoise(p); p = p*2.03 + 7.1; a *= 0.5; } return s; }
`;

// ---------- 1) 光芒（解析的ボリューム） ----------
// 背面だけを描き、カメラ→背面のレイを「シアー（太陽方向への傾き）を解いた空間」で箱と交差させ、
// 箱内の通過区間を数ステップ積分する。視点が光芒の中に入っても破綻しない本物の体積感。
const shaftVert = /* glsl */`
  attribute vec4 aBox; attribute float aTop; varying vec3 vW; varying vec4 vBox; varying float vTop;
  void main(){ vBox = aBox; vTop = aTop; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz;
    gl_Position = projectionMatrix*viewMatrix*w; }`;
const shaftFrag = /* glsl */`
  uniform float uTime, uSun, uGain, uH; uniform vec3 uColor; uniform vec2 uSunOff;
  varying vec3 vW; varying vec4 vBox; varying float vTop;
  float h31(vec3 p){ p = fract(p*0.3183099 + .1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x), mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x), mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y), f.z); }
  vec3 unshear(vec3 p){ float k = (vTop - p.y) / uH; return vec3(p.x - vBox.x - uSunOff.x*k, p.y, p.z - vBox.y - uSunOff.y*k); }
  void main(){
    vec3 ro = unshear(cameraPosition), re = unshear(vW);
    vec3 rd = re - ro; float L = length(rd); rd /= L;
    vec3 bmin = vec3(-vBox.z*0.5, 0.0, -vBox.w*0.5), bmax = vec3(vBox.z*0.5, vTop, vBox.w*0.5);
    vec3 inv = 1.0 / (rd + vec3(1e-6));
    vec3 t0 = (bmin - ro)*inv, t1 = (bmax - ro)*inv;
    vec3 tn = min(t0,t1), tf = max(t0,t1);
    float a = max(max(tn.x,tn.y),max(tn.z,0.0)), b = min(min(tf.x,tf.y),min(tf.z,L));
    if (b <= a) discard;
    float acc = 0.0; const int N = 5;
    float dt = (b - a) / float(N);
    for (int i = 0; i < N; i++) {
      vec3 q = ro + rd*(a + dt*(float(i) + 0.5));
      float k = (vTop - q.y) / uH;                                     // 0=窓, 1=床
      vec2 e = abs(q.xz) / (vec2(vBox.z, vBox.w)*0.5);
      float soft = (1.0 - smoothstep(0.55, 1.0, e.x)) * (1.0 - smoothstep(0.55, 1.0, e.y)); // 縁を柔らかく
      float dens = soft * mix(1.0, 0.3, k) * smoothstep(0.0, 0.05, k);
      vec3 wp = q + vec3(vBox.x + uSunOff.x*k, 0.0, vBox.y + uSunOff.y*k);
      float n = vn(wp*vec3(0.9,0.3,0.9) + vec3(0.0, uTime*0.05, uTime*0.02)) * 0.65
              + vn(wp*2.1 + vec3(uTime*0.03, -uTime*0.08, 0.0)) * 0.35;
      acc += dens * (0.45 + 1.1*n);
    }
    acc *= dt;
    acc *= smoothstep(0.3, 2.5, a + 0.6*(b-a));                      // 目の前で白飛びしない
    float o = 1.0 - exp(-acc * uGain);                                 // ビア＝ランバート的に飽和
    o *= exp(-a * 0.045);                                              // 遠方の光芒は霞に溶ける（加算の積み重なり防止）
    gl_FragColor = vec4(uColor * o * uSun, 1.0);
  }`;

// ---------- 2) 床の光だまり ----------
const poolVert = /* glsl */`
  varying vec2 vUv; varying vec3 vW;
  void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;
const poolFrag = /* glsl */`
  uniform float uTime, uSun, uGain; uniform vec3 uColor; uniform vec2 uPanes;
  varying vec2 vUv; varying vec3 vW;
  ${NOISE}
  void main(){
    vec2 u = vUv;
    float edge = smoothstep(0.0, 0.16, u.x) * smoothstep(1.0, 0.84, u.x) * smoothstep(0.0, 0.12, u.y) * smoothstep(1.0, 0.88, u.y);
    // 天窓の桟の影（ソフト）
    vec2 g = abs(fract(u*uPanes) - 0.5);
    float mull = smoothstep(0.43, 0.48, g.x); float mullY = smoothstep(0.44, 0.49, g.y);
    float frame = 1.0 - 0.75*max(mull, mullY);
    // ガラス越しのゆらぎ（ごく弱いコースティクス）
    vec2 p = vW.xz*2.2;
    float c = fbm(vec3(p, uTime*0.12)); c = pow(1.0 - abs(c*2.0 - 1.0), 6.0);
    float cloud = 0.8 + 0.4*fbm(vec3(vW.xz*0.15, uTime*0.03));
    float a = edge * frame * (0.85 + 0.35*c) * cloud;
    gl_FragColor = vec4(uColor * a * uSun * uGain, 1.0);
  }`;

// ---------- 3) 埃 ----------
const dustVert = /* glsl */`
  uniform float uTime, uPixel, uH, uW, uSkyN; uniform vec3 uCam, uBox; uniform vec2 uSunOff;
  uniform vec4 uSky[${MAXS}];
  attribute vec4 aRnd;
  varying float vB; varying float vA;
  void main(){
    vec3 p = position;
    p += vec3(sin(uTime*0.11 + aRnd.x*40.0)*0.6 + uTime*0.015*(aRnd.y-0.5),
              -uTime*0.03*(0.3+aRnd.y) + sin(uTime*0.07 + aRnd.z*30.0)*0.35,
              cos(uTime*0.09 + aRnd.w*50.0)*0.6);
    // カメラ追従ラップ（長い回廊でも一定密度・少ない粒数）
    vec3 w;
    w.x = -uW*0.5 + mod(p.x + uW*0.5, uW);
    w.y = 0.05 + mod(p.y, uH - 0.1);
    float bz = uCam.z - uBox.z*0.5; w.z = bz + mod(p.z - bz, uBox.z);
    float ez = abs(w.z - uCam.z) / (uBox.z*0.5);
    float edge = 1.0 - smoothstep(0.7, 1.0, ez);
    // 光芒の内側にいるか（天窓開口を太陽方向へ投影したシアー柱）
    float beam = 0.0; float k = (uH - w.y) / uH;
    for (int i = 0; i < ${MAXS}; i++) {
      if (float(i) >= uSkyN) break;
      vec4 s = uSky[i];
      vec2 d = abs(w.xz - (s.xy + uSunOff*k)) / (s.zw*0.5);
      beam = max(beam, (1.0 - smoothstep(0.6, 1.0, d.x)) * (1.0 - smoothstep(0.6, 1.0, d.y)));
    }
    vec4 mv = viewMatrix * vec4(w, 1.0);
    gl_Position = projectionMatrix * mv;
    float tw = pow(0.5 + 0.5*sin(uTime*(1.5 + aRnd.w*4.0) + aRnd.x*90.0), 3.0); // 舞う薄片が光を返す瞬き
    gl_PointSize = clamp(uPixel * (5.0 + 9.0*aRnd.w*aRnd.w) / -mv.z, 0.75, 4.5);
    vB = beam * (0.35 + 0.9*tw);
    vA = edge * smoothstep(0.6, 2.2, -mv.z) * (0.04 + 0.96*beam);
  }`;
const dustFrag = /* glsl */`
  uniform vec3 uColor; uniform float uSun; varying float vB; varying float vA;
  void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)); a *= a;
    gl_FragColor = vec4(uColor * (0.10 + 1.25*vB*uSun) * a * vA, 1.0); }`;

// ---------- 4) 金箔 ----------
const leafVert = /* glsl */`
  uniform float uT, uLife; uniform vec3 uOrigin;
  attribute vec4 aRnd; attribute vec2 aRnd2;
  varying vec2 vUv; varying float vDiff; varying float vSpec; varying float vA; varying float vSeed;
  mat3 rot(vec3 ax, float a){ float s = sin(a), c = cos(a), oc = 1.0 - c;
    return mat3(oc*ax.x*ax.x+c, oc*ax.x*ax.y+ax.z*s, oc*ax.z*ax.x-ax.y*s,
                oc*ax.x*ax.y-ax.z*s, oc*ax.y*ax.y+c, oc*ax.y*ax.z+ax.x*s,
                oc*ax.z*ax.x+ax.y*s, oc*ax.y*ax.z-ax.x*s, oc*ax.z*ax.z+c); }
  void main(){
    vUv = uv; vSeed = aRnd.x;
    float t = max(0.0, uT - aRnd2.x*0.25);
    vec3 dir = normalize(vec3(aRnd.x*2.0-1.0, 0.55 + aRnd.y*1.1, aRnd.z*2.0-1.0));
    float sp = 0.9 + aRnd.w*1.5;
    vec3 p = uOrigin + dir * sp * (1.0 - exp(-t*2.6)) * 0.55;       // ふわっと広がる（空気抵抗）
    float fall = max(0.0, t - 0.35);
    p.y -= fall * (0.22 + aRnd.y*0.2);                                 // 終端速度でゆっくり落下
    p.x += sin(t*(1.6+aRnd.z) + aRnd.x*30.0) * 0.18 * min(fall, 1.5);  // ひらひら
    p.z += cos(t*(1.3+aRnd.x) + aRnd.z*20.0) * 0.18 * min(fall, 1.5);
    float landed = step(p.y, 0.012); p.y = max(p.y, 0.012);
    vec3 ax = normalize(vec3(aRnd.y-0.5, aRnd.z-0.5, aRnd.x-0.5) + 1e-3);
    float ang = mix(t*(2.5 + aRnd.w*5.0) + aRnd.x*6.2831, 1.5708, landed);
    mat3 R = landed > 0.5 ? mat3(1,0,0, 0,0,-1, 0,1,0) : rot(ax, ang);
    float sc = 0.6 + aRnd2.y*0.9;
    vec3 wp = p + R * (position * sc);
    vec3 n = R * vec3(0.0, 0.0, 1.0);
    vec3 V = normalize(cameraPosition - wp);
    vec3 L = normalize(vec3(0.35, 1.0, 0.25));
    vDiff = abs(dot(n, L));
    vSpec = pow(abs(dot(n, normalize(L + V))), 48.0);
    vA = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(uLife - 1.4, uLife, uT));
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;
const leafFrag = /* glsl */`
  uniform vec3 uGold; varying vec2 vUv; varying float vDiff; varying float vSpec; varying float vA; varying float vSeed;
  float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1)))*43758.5); }
  void main(){
    vec2 c = vUv - 0.5;
    // 破れたような不揃いの輪郭
    float ang = atan(c.y, c.x); float r = length(c*vec2(1.0, 0.8));
    float lim = 0.42 + 0.07*sin(ang*5.0 + vSeed*40.0) + 0.04*sin(ang*11.0 + vSeed*13.0);
    if (r > lim) discard;
    float crinkle = 0.85 + 0.3*h(floor(vUv*7.0) + vSeed);
    vec3 col = uGold * (0.55 + 0.9*vDiff) * crinkle + vec3(1.0, 0.9, 0.7) * vSpec * 2.2;
    gl_FragColor = vec4(col, vA);
  }`;

function defaultSkylights(z0, length, H) {
  const out = [];
  for (let z = z0 - 6; z > z0 - length; z -= 12) out.push({ x: 0, y: H, z, w: 3.2, d: 4.6 });
  return out;
}

export function createFX(scene, renderer, opts = {}) {
  const { length = 220, z0 = 12, count = 3200 } = opts;
  const hall = { width: opts.hall?.width ?? 12, height: opts.hall?.height ?? 7.5 };
  const H = hall.height;
  const sunOff = opts.sunOffset ?? new THREE.Vector2(1.5, 1.1).multiplyScalar(H / 7.5);
  const skylights = (opts.skylights && opts.skylights.length ? opts.skylights : defaultSkylights(z0, length, H))
    .map(s => ({ x: s.x ?? 0, y: s.y ?? H, z: s.z, w: s.w ?? 3.2, d: s.d ?? 4.6 }));
  const pixel = renderer.getPixelRatio();
  const group = new THREE.Group(); group.name = 'fx'; scene.add(group);
  const sunU = { value: 1 };

  // ---- 光芒・光だまり（それぞれ1ドローコールに結合） ----
  const shaftGeos = [], poolGeos = [];
  for (const s of skylights) {
    const top = s.y, bot = 0.0, h = top - bot;
    const g = new THREE.BoxGeometry(s.w * 0.96, h, s.d * 0.96, 1, 1, 1);
    g.translate(0, bot + h / 2, 0);
    const pos = g.attributes.position, aBox = new Float32Array(pos.count * 4), aTop = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i), k = (top - y) / H; // 0=窓, 1=床
      pos.setX(i, pos.getX(i) * 1.02 + s.x + sunOff.x * k);
      pos.setZ(i, pos.getZ(i) * 1.02 + s.z + sunOff.y * k);
      aBox.set([s.x, s.z, s.w * 0.96, s.d * 0.96], i * 4); aTop[i] = top;
    }
    g.setAttribute('aBox', new THREE.BufferAttribute(aBox, 4));
    g.setAttribute('aTop', new THREE.BufferAttribute(aTop, 1));
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    shaftGeos.push(g);
    const kf = (top - 0.0) / H;
    const p = new THREE.PlaneGeometry(s.w * 1.12, s.d * 1.12); p.rotateX(-Math.PI / 2);
    p.translate(s.x + sunOff.x * kf, 0.006, s.z + sunOff.y * kf);
    poolGeos.push(p);
  }
  const SHAFT_GAIN = 0.032;
  const shaftU = { uTime: { value: 0 }, uSun: sunU, uGain: { value: SHAFT_GAIN }, uColor: { value: SUN_COLOR.clone() },
    uH: { value: H }, uSunOff: { value: sunOff.clone() } };
  const shafts = new THREE.Mesh(mergeGeometries(shaftGeos), new THREE.ShaderMaterial({
    uniforms: shaftU, vertexShader: shaftVert, fragmentShader: shaftFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
  }));
  shafts.frustumCulled = false; shafts.renderOrder = 5; shafts.name = 'fx-shafts'; group.add(shafts);
  shaftGeos.forEach(g => g.dispose());

  const poolU = { uTime: { value: 0 }, uSun: sunU, uGain: { value: 0.34 }, uColor: { value: SUN_COLOR.clone() }, uPanes: { value: new THREE.Vector2(3, 4) } };
  const pools = new THREE.Mesh(mergeGeometries(poolGeos), new THREE.ShaderMaterial({
    uniforms: poolU, vertexShader: poolVert, fragmentShader: poolFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  pools.frustumCulled = false; pools.renderOrder = 4; pools.name = 'fx-pools'; group.add(pools);
  poolGeos.forEach(g => g.dispose());

  // ---- 埃 ----
  const BOX = new THREE.Vector3(hall.width, H, 34);
  const dpos = new Float32Array(count * 3), drnd = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    dpos[i * 3] = Math.random() * hall.width; dpos[i * 3 + 1] = Math.random() * H; dpos[i * 3 + 2] = Math.random() * BOX.z;
    drnd.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  dg.setAttribute('aRnd', new THREE.BufferAttribute(drnd, 4));
  const skyArr = Array.from({ length: MAXS }, () => new THREE.Vector4());
  const dustU = {
    uTime: { value: 0 }, uPixel: { value: pixel }, uH: { value: H }, uW: { value: hall.width },
    uCam: { value: new THREE.Vector3(0, 1.6, z0) }, uBox: { value: BOX }, uSunOff: { value: sunOff.clone() },
    uSky: { value: skyArr }, uSkyN: { value: 0 }, uColor: { value: SUN_COLOR.clone() }, uSun: sunU,
  };
  const dust = new THREE.Points(dg, new THREE.ShaderMaterial({
    uniforms: dustU, vertexShader: dustVert, fragmentShader: dustFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  dust.frustumCulled = false; dust.renderOrder = 6; dust.name = 'fx-dust'; group.add(dust);

  // 天窓が MAXS を超える場合はカメラ近傍から選ぶ（2m移動ごと・確保済み配列を再利用）
  const order = skylights.map((s, i) => i);
  let lastSkyZ = Infinity;
  function refreshSky(camZ) {
    if (Math.abs(camZ - lastSkyZ) < 2) return; lastSkyZ = camZ;
    if (skylights.length > MAXS) order.sort((a, b) => Math.abs(skylights[a].z - camZ) - Math.abs(skylights[b].z - camZ));
    const n = Math.min(MAXS, skylights.length);
    for (let i = 0; i < n; i++) { const s = skylights[order[i]]; skyArr[i].set(s.x, s.z, s.w, s.d); }
    dustU.uSkyN.value = n;
  }
  refreshSky(z0);

  // ---- 金箔バースト（プール4、各200枚） ----
  const LEAVES = 200, LIFE = 5.2;
  const lg = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(0.045, 0.06);
  lg.index = quad.index; lg.setAttribute('position', quad.attributes.position); lg.setAttribute('uv', quad.attributes.uv);
  const lr = new Float32Array(LEAVES * 4), lr2 = new Float32Array(LEAVES * 2);
  for (let i = 0; i < LEAVES; i++) { lr.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4); lr2.set([Math.random(), Math.random()], i * 2); }
  lg.setAttribute('aRnd', new THREE.InstancedBufferAttribute(lr, 4));
  lg.setAttribute('aRnd2', new THREE.InstancedBufferAttribute(lr2, 2));
  lg.instanceCount = LEAVES;
  const bursts = [];
  for (let i = 0; i < 4; i++) {
    const u = { uT: { value: 99 }, uLife: { value: LIFE }, uOrigin: { value: new THREE.Vector3() }, uGold: { value: GOLD.clone() } };
    const m = new THREE.Mesh(lg, new THREE.ShaderMaterial({
      uniforms: u, vertexShader: leafVert, fragmentShader: leafFrag,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    m.frustumCulled = false; m.visible = false; m.renderOrder = 7; m.name = 'fx-gold'; group.add(m);
    bursts.push({ m, u });
  }
  let bi = 0;
  const tmpC = new THREE.Color();

  // ---- 雲の通過による日照ゆらぎ ----
  let sunBase = 1, sun = 1, glow = 0, glowT = 0;
  const cloud = (t) => 0.82 + 0.1 * Math.sin(t * 0.071) + 0.06 * Math.sin(t * 0.193 + 1.3) + 0.03 * Math.sin(t * 0.47 + 4.0);

  return {
    group, skylights,
    get sun() { return sun; },
    setSun(v) { sunBase = v; },
    // フィナーレ: 雲が切れて光が満ちる（光芒・光だまり・埃が徐々に強まる）。on=false で通常へ戻る
    finale(on = true) { glowT = on ? 1 : 0; },
    setDensity(q) {
      dg.setDrawRange(0, Math.floor(count * q));
      shaftU.uGain.value = SHAFT_GAIN * (q < 0.5 ? 0.85 : 1);
    },
    setPixelRatio(pr) { dustU.uPixel.value = pr; },
    burst(position, color) {
      const b = bursts[bi++ % bursts.length];
      b.u.uOrigin.value.copy(position);
      // 展示色は「金にわずかに混ぜる」だけ（彩度の高い発光は使わない）
      tmpC.set(color ?? GOLD); b.u.uGold.value.copy(GOLD).lerp(tmpC, 0.18);
      b.u.uT.value = 0; b.m.visible = true;
    },
    update(t, dt, camera) {
      glow += (glowT - glow) * Math.min(1, dt * 0.8);
      sun = sunBase * (cloud(t) * (1 - glow) + 1.55 * glow);
      shaftU.uTime.value = poolU.uTime.value = dustU.uTime.value = t;
      if (camera) { dustU.uCam.value.copy(camera.position); refreshSky(camera.position.z); }
      for (const b of bursts) if (b.m.visible) { b.u.uT.value += dt; if (b.u.uT.value > LIFE) b.m.visible = false; }
    },
  };
}
