// exhibit.js — Owner: B
// ホログラム展示: 台座 + 浮遊彫刻(フレネル/スキャンラインシェーダ) + 回転リング + 光柱 + 情報パネル(CanvasTexture)
import * as THREE from 'three';

const FONT_JP = '"Noto Sans JP","Hiragino Sans","Yu Gothic",sans-serif';
const FONT_EN = '"Orbitron","Rajdhani","Segoe UI",sans-serif';

// ---------- 共有シェーダ ----------
const holoVert = /* glsl */`
  uniform float uTime;
  varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main(){
    vec3 p = position;
    float g = step(0.985, fract(sin(floor(uTime*6.0)*91.7 + p.y*3.0)*4375.5)); // グリッチ
    p.x += g * 0.06 * sin(uTime*80.0);
    vec4 wp = modelMatrix * vec4(p,1.0);
    vP = wp.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const holoFrag = /* glsl */`
  uniform float uTime; uniform vec3 uColor; uniform float uFocus;
  varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main(){
    float fr = pow(1.0 - abs(dot(normalize(vN), vV)), 2.2);
    float scan = 0.55 + 0.45 * sin(vP.y * 60.0 - uTime * 6.0);
    float band = smoothstep(0.0, 0.02, abs(fract(vP.y*0.6 - uTime*0.35) - 0.5) - 0.47);
    float a = fr * 1.25 * scan + band * 0.6 + 0.04;
    vec3 col = mix(uColor, vec3(1.0), fr * 0.55);
    gl_FragColor = vec4(col * (1.2 + uFocus * 1.6), a * (0.65 + uFocus * 0.35));
  }`;

const beamVert = /* glsl */`
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main(){ vUv = uv; vec4 wp = modelMatrix*vec4(position,1.0);
    vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition-wp.xyz);
    gl_Position = projectionMatrix*viewMatrix*wp; }`;
const beamFrag = /* glsl */`
  uniform vec3 uColor; uniform float uTime; uniform float uFocus;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main(){
    float edge = pow(abs(dot(normalize(vN), vV)), 1.5);
    float fall = pow(vUv.y, 1.6);            // 下(床)ほど明るい
    float dust = 0.8 + 0.2*sin(vUv.y*40.0 + uTime*2.0 + vUv.x*30.0);
    float a = edge * (1.0 - fall) * 0.22 * dust * (0.5 + uFocus);
    gl_FragColor = vec4(uColor * 1.4, a);
  }`;

// ---------- パネル描画 ----------
function wrapJP(ctx, text, maxW) {
  const lines = []; let line = '';
  for (const ch of text) {
    const t = line + ch;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = ch; }
    else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function makePanelTexture(n, renderer) {
  const W = 1024, H = 640;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  // 背景: 深いガラス
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, 'rgba(10,14,28,0.92)'); bg.addColorStop(1, 'rgba(4,6,14,0.86)');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // 枠線とコーナー
  g.strokeStyle = n.color; g.globalAlpha = 0.9; g.lineWidth = 3;
  g.strokeRect(14, 14, W - 28, H - 28);
  g.globalAlpha = 1; g.lineWidth = 8;
  [[14, 14, 1, 1], [W - 14, 14, -1, 1], [14, H - 14, 1, -1], [W - 14, H - 14, -1, -1]].forEach(([x, y, sx, sy]) => {
    g.beginPath(); g.moveTo(x + sx * 60, y); g.lineTo(x, y); g.lineTo(x, y + sy * 60); g.stroke();
  });
  // 細かいグリッド
  g.globalAlpha = 0.06; g.strokeStyle = '#ffffff'; g.lineWidth = 1;
  for (let x = 40; x < W; x += 32) { g.beginPath(); g.moveTo(x, 20); g.lineTo(x, H - 20); g.stroke(); }
  for (let y = 40; y < H; y += 32) { g.beginPath(); g.moveTo(20, y); g.lineTo(W - 20, y); g.stroke(); }
  g.globalAlpha = 1;
  // 番号
  g.fillStyle = n.color; g.font = `900 150px ${FONT_EN}`; g.textBaseline = 'top';
  g.globalAlpha = 0.18; g.fillText(n.no, W - 300, 30); g.globalAlpha = 1;
  // 日付 / カテゴリ
  g.font = `700 64px ${FONT_EN}`; g.fillStyle = '#ffffff';
  g.shadowColor = n.color; g.shadowBlur = 24;
  g.fillText(n.date, 60, 60);
  g.shadowBlur = 0;
  g.font = `700 26px ${FONT_EN}`;
  const tag = ` ${n.category} `; const tw = g.measureText(tag).width + 24;
  g.fillStyle = n.color; g.fillRect(60, 146, tw, 40);
  g.fillStyle = '#05060c'; g.fillText(tag, 72, 152);
  g.fillStyle = 'rgba(255,255,255,0.65)'; g.font = `500 26px ${FONT_EN}`;
  g.fillText(n.org.toUpperCase(), 60 + tw + 20, 154);
  // タイトル
  g.fillStyle = '#ffffff'; g.font = `900 66px ${FONT_JP}`;
  const tl = wrapJP(g, n.title, W - 120);
  tl.slice(0, 2).forEach((l, i) => g.fillText(l, 60, 214 + i * 78));
  let y = 214 + Math.min(tl.length, 2) * 78 + 6;
  g.fillStyle = n.color; g.font = `600 30px ${FONT_EN}`;
  g.fillText(n.titleEn, 60, y); y += 56;
  // 区切り
  g.fillStyle = n.color; g.fillRect(60, y, 120, 4); y += 26;
  // 要約
  g.fillStyle = 'rgba(225,232,255,0.92)'; g.font = `400 30px ${FONT_JP}`;
  wrapJP(g, n.summary, W - 120).slice(0, 3).forEach((l, i) => g.fillText(l, 60, y + i * 44));
  // フッター
  g.fillStyle = 'rgba(255,255,255,0.45)'; g.font = `500 22px ${FONT_EN}`;
  g.fillText(`IMPACT // ${n.impact}`, 60, H - 62);
  g.textAlign = 'right'; g.fillText(`SRC: ${n.source}`, W - 60, H - 62);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

// ---------- 彫刻ジオメトリ（カテゴリ別） ----------
const geoCache = {};
function sculptureGeo(cat) {
  if (geoCache[cat]) return geoCache[cat];
  let geo;
  switch (cat) {
    case 'CHAT': geo = new THREE.TorusKnotGeometry(0.42, 0.12, 160, 18, 2, 3); break;
    case 'MODEL': geo = new THREE.IcosahedronGeometry(0.55, 1); break;
    case 'IMAGE': geo = new THREE.TorusKnotGeometry(0.38, 0.1, 160, 16, 3, 5); break;
    case 'VIDEO': geo = new THREE.TorusGeometry(0.45, 0.16, 24, 80); break;
    case 'POLICY': geo = new THREE.OctahedronGeometry(0.6, 0); break;
    case 'COMPUTE': geo = new THREE.BoxGeometry(0.7, 0.7, 0.7, 4, 4, 4); break;
    case 'REASONING': geo = new THREE.DodecahedronGeometry(0.55, 0); break;
    case 'SCIENCE': geo = new THREE.TorusKnotGeometry(0.4, 0.06, 220, 10, 5, 2); break;
    case 'SECURITY': geo = new THREE.TetrahedronGeometry(0.65, 0); break;
    case 'SAFETY': geo = new THREE.SphereGeometry(0.55, 48, 32); break;
    case 'AGENT': geo = new THREE.TorusKnotGeometry(0.4, 0.14, 180, 20, 1, 4); break;
    case 'DEVICE': geo = new THREE.CapsuleGeometry(0.28, 0.5, 8, 24); break;
    default: geo = new THREE.IcosahedronGeometry(0.55, 2);
  }
  return (geoCache[cat] = geo);
}

// 共有ジオメトリ
const G = {
  pedestal: new THREE.CylinderGeometry(0.62, 0.78, 0.9, 48, 1),
  pedTop: new THREE.TorusGeometry(0.64, 0.018, 8, 96),
  ring: new THREE.TorusGeometry(0.95, 0.008, 6, 128),
  ring2: new THREE.TorusGeometry(1.12, 0.005, 6, 128),
  beam: new THREE.CylinderGeometry(0.55, 1.15, 7, 40, 1, true),
  panel: new THREE.PlaneGeometry(2.4, 1.5),
  frame: new THREE.BoxGeometry(2.5, 1.6, 0.04),
  core: new THREE.IcosahedronGeometry(0.16, 2),
};

let pedMat = null;
export function makeExhibit(news, index, renderer) {
  const color = new THREE.Color(news.color);
  const group = new THREE.Group();
  group.name = `exhibit-${index}`;
  const uniforms = { uTime: { value: 0 }, uColor: { value: color }, uFocus: { value: 0 } };

  // 台座
  pedMat ??= new THREE.MeshPhysicalMaterial({ color: 0x0b0d14, metalness: 0.9, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 });
  const ped = new THREE.Mesh(G.pedestal, pedMat);
  ped.position.set(-0.95, 0.45, 0);
  group.add(ped);
  const glowMat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(3), toneMapped: false });
  const pedRing = new THREE.Mesh(G.pedTop, glowMat);
  pedRing.rotation.x = Math.PI / 2; pedRing.position.set(-0.95, 0.9, 0);
  group.add(pedRing);

  // 浮遊彫刻
  const holoMat = new THREE.ShaderMaterial({
    uniforms, vertexShader: holoVert, fragmentShader: holoFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const sculpt = new THREE.Mesh(sculptureGeo(news.category), holoMat);
  sculpt.position.set(-0.95, 1.85, 0);
  group.add(sculpt);
  const wire = new THREE.LineSegments(new THREE.WireframeGeometry(sculptureGeo(news.category)),
    new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(1.6), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sculpt.add(wire);
  const core = new THREE.Mesh(G.core, new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 4), toneMapped: false }));
  sculpt.add(core);

  // 回転リング
  const ringMat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2.2), transparent: true, opacity: 0.85, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false });
  const r1 = new THREE.Mesh(G.ring, ringMat); r1.position.copy(sculpt.position); group.add(r1);
  const r2 = new THREE.Mesh(G.ring2, ringMat); r2.position.copy(sculpt.position); group.add(r2);

  // 光柱
  const beam = new THREE.Mesh(G.beam, new THREE.ShaderMaterial({
    uniforms, vertexShader: beamVert, fragmentShader: beamFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  beam.position.set(-0.95, 3.5, 0);
  group.add(beam);

  // 情報パネル
  const panelGroup = new THREE.Group();
  panelGroup.position.set(1.15, 1.75, 0.15);
  panelGroup.rotation.y = -0.28;
  const frame = new THREE.Mesh(G.frame, new THREE.MeshPhysicalMaterial({ color: 0x0a0c12, metalness: 1, roughness: 0.3 }));
  frame.position.z = -0.03;
  const tex = makePanelTexture(news, renderer);
  const panelMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, color: new THREE.Color(1.05, 1.05, 1.05) });
  const panel = new THREE.Mesh(G.panel, panelMat);
  const edge = new THREE.Mesh(new THREE.PlaneGeometry(2.52, 0.012), glowMat);
  edge.position.y = -0.81;
  panelGroup.add(frame, panel, edge);
  group.add(panelGroup);

  let focus = 0;
  const baseY = sculpt.position.y;
  group.userData = {
    news, uniforms, sculpt, panelGroup,
    focusTarget: 0,
    update(t, dt) {
      focus += (this.focusTarget - focus) * Math.min(1, dt * 3);
      uniforms.uTime.value = t; uniforms.uFocus.value = focus;
      sculpt.rotation.y += dt * (0.35 + focus * 0.6);
      sculpt.rotation.x = Math.sin(t * 0.5 + index) * 0.25;
      sculpt.position.y = baseY + Math.sin(t * 1.3 + index) * 0.08;
      const s = 1 + focus * 0.12; sculpt.scale.setScalar(s);
      r1.rotation.set(Math.PI / 2 + Math.sin(t * 0.7) * 0.4, t * 0.6, 0);
      r2.rotation.set(Math.PI / 2.4, -t * 0.4, Math.cos(t * 0.5) * 0.3);
      panelGroup.position.y = 1.75 + Math.sin(t * 0.9 + index * 0.7) * 0.03;
      panelMat.opacity = 0.55 + focus * 0.45;
    },
  };
  return group;
}
