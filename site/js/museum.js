// museum.js — Owner: C
// 回廊建築: 反射床・リブ天井・発光ストリップ(InstancedMesh)・ウィングゲート・終端アトリウム・カメラパス
import * as THREE from 'three';
import { makeExhibit } from './exhibit.js';
import { WINGS } from './data/news.js';

const HALL_W = 12, HALL_H = 7.5, SPACING = 7.5, WING_GAP = 9, SIDE_X = 4.3;

function floorTexture(renderer) {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#05060a'; g.fillRect(0, 0, S, S);
  // 大判タイル
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const v = 8 + ((x * 7 + y * 13) % 5);
    g.fillStyle = `rgb(${v},${v + 1},${v + 4})`; g.fillRect(x * 256 + 2, y * 256 + 2, 252, 252);
  }
  g.strokeStyle = 'rgba(120,200,255,0.55)'; g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 256, 0); g.lineTo(i * 256, S); g.stroke(); g.beginPath(); g.moveTo(0, i * 256); g.lineTo(S, i * 256); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}

function textTexture(lines, color, w = 2048, h = 512) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach(({ text, size, y, weight = 900, font = '"Orbitron","Segoe UI",sans-serif', alpha = 1, spacing = 0 }) => {
    g.font = `${weight} ${size}px ${font}`;
    g.globalAlpha = alpha;
    if ('letterSpacing' in g) g.letterSpacing = `${spacing}px`;
    g.shadowColor = color; g.shadowBlur = size * 0.35; g.fillStyle = color; g.fillText(text, w / 2, y);
    g.shadowBlur = 0; g.fillStyle = '#ffffff'; g.fillText(text, w / 2, y);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildMuseum(scene, NEWS, renderer) {
  const root = new THREE.Group(); root.name = 'museum'; scene.add(root);
  const exhibits = [];
  const viewPoints = [];
  const stops = [];
  const updaters = [];

  // ---------- 展示の配置 ----------
  let z = -10, prevWing = null, side = -1;
  const gates = [];
  NEWS.forEach((n, i) => {
    if (n.wing !== prevWing) {
      if (prevWing !== null) z -= WING_GAP;
      gates.push({ z: z + 5, wing: WINGS.find(w => w.id === n.wing) });
      prevWing = n.wing;
    }
    const ex = makeExhibit(n, i, renderer);
    ex.position.set(side * SIDE_X, 0, z);
    ex.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    root.add(ex);
    const anchor = new THREE.Vector3(side * SIDE_X, 1.75, z);
    const viewPos = new THREE.Vector3(-side * 0.55, 1.65, z + 0.25);
    exhibits.push({ mesh: ex, anchor, viewPos, news: n, side });
    z -= SPACING; side *= -1;
  });
  const endZ = z - 8;
  const totalLen = -endZ + 20;
  const midZ = (endZ + 12) / 2;

  // ---------- 床 ----------
  const ft = floorTexture(renderer); ft.repeat.set(HALL_W / 4, totalLen / 4);
  const floorMat = new THREE.MeshPhysicalMaterial({
    color: 0x9aa3b8, map: ft, metalness: 0.85, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.04,
    envMapIntensity: 1.3,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, totalLen), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, midZ);
  root.add(floor);

  // ---------- 壁 ----------
  const wallMat = new THREE.MeshPhysicalMaterial({ color: 0x07080d, metalness: 0.7, roughness: 0.45, side: THREE.BackSide });
  const wallGeo = new THREE.PlaneGeometry(totalLen, HALL_H);
  [-1, 1].forEach(s => {
    const w = new THREE.Mesh(wallGeo, wallMat);
    w.rotation.y = s * Math.PI / 2; w.position.set(s * HALL_W / 2, HALL_H / 2, midZ);
    w.material = new THREE.MeshPhysicalMaterial({ color: 0x07080d, metalness: 0.7, roughness: 0.45 });
    w.rotation.y = -s * Math.PI / 2;
    root.add(w);
  });

  // ---------- リブ（柱+天井梁）InstancedMesh ----------
  const ribCount = Math.ceil(totalLen / 3.2);
  const ribMat = new THREE.MeshPhysicalMaterial({ color: 0x10131c, metalness: 1, roughness: 0.28, clearcoat: 0.6 });
  const pillarGeo = new THREE.BoxGeometry(0.35, HALL_H, 0.35);
  const beamGeo = new THREE.BoxGeometry(HALL_W, 0.3, 0.35);
  const pillars = new THREE.InstancedMesh(pillarGeo, ribMat, ribCount * 2);
  const beams = new THREE.InstancedMesh(beamGeo, ribMat, ribCount);
  const stripGeo = new THREE.BoxGeometry(0.04, HALL_H - 0.6, 0.04);
  const strips = new THREE.InstancedMesh(stripGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), ribCount * 2);
  const ceilStripGeo = new THREE.BoxGeometry(HALL_W - 1, 0.03, 0.05);
  const ceilStrips = new THREE.InstancedMesh(ceilStripGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), ribCount);
  const m = new THREE.Matrix4(), col = new THREE.Color();
  const wingAtZ = (zz) => {
    let best = exhibits[0];
    for (const e of exhibits) if (Math.abs(e.anchor.z - zz) < Math.abs(best.anchor.z - zz)) best = e;
    return best.news.color;
  };
  for (let i = 0; i < ribCount; i++) {
    const rz = 10 - i * 3.2;
    m.makeTranslation(-HALL_W / 2 + 0.18, HALL_H / 2, rz); pillars.setMatrixAt(i * 2, m);
    m.makeTranslation(HALL_W / 2 - 0.18, HALL_H / 2, rz); pillars.setMatrixAt(i * 2 + 1, m);
    m.makeTranslation(0, HALL_H - 0.15, rz); beams.setMatrixAt(i, m);
    col.set(wingAtZ(rz)).multiplyScalar(2.6);
    m.makeTranslation(-HALL_W / 2 + 0.38, HALL_H / 2, rz); strips.setMatrixAt(i * 2, m); strips.setColorAt(i * 2, col);
    m.makeTranslation(HALL_W / 2 - 0.38, HALL_H / 2, rz); strips.setMatrixAt(i * 2 + 1, m); strips.setColorAt(i * 2 + 1, col);
    m.makeTranslation(0, HALL_H - 0.32, rz); ceilStrips.setMatrixAt(i, m); ceilStrips.setColorAt(i, col.clone().multiplyScalar(0.7));
  }
  root.add(pillars, beams, strips, ceilStrips);

  // ---------- 床の発光ライン（ガイド） ----------
  const guideMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `varying vec3 vP; void main(){ vec4 w = modelMatrix*vec4(position,1.); vP=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uTime; varying vec3 vP;
      vec3 pal(float z){ float k = clamp(-z/190.0,0.,1.);
        vec3 a=vec3(0.22,0.91,1.0), b=vec3(0.54,0.48,1.0), c=vec3(1.0,0.37,0.82), d=vec3(1.0,0.71,0.28), e=vec3(1.0,0.29,0.37);
        if(k<.25) return mix(a,b,k/.25); if(k<.5) return mix(b,c,(k-.25)/.25); if(k<.75) return mix(c,d,(k-.5)/.25); return mix(d,e,(k-.75)/.25); }
      void main(){ float pulse = pow(fract(-vP.z*0.06 + uTime*0.5), 6.0);
        gl_FragColor = vec4(pal(vP.z) * (1.2 + pulse*4.0), 0.9); }`,
  });
  [-1, 1].forEach(s => {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(0.06, totalLen), guideMat);
    l.rotation.x = -Math.PI / 2; l.position.set(s * 2.6, 0.005, midZ); root.add(l);
  });
  updaters.push((t) => { guideMat.uniforms.uTime.value = t; });

  // ---------- ウィングゲート ----------
  const gateGeo = new THREE.TorusGeometry(4.6, 0.07, 12, 120, Math.PI);
  const gateGeo2 = new THREE.TorusGeometry(4.9, 0.025, 8, 120, Math.PI);
  gates.forEach(({ z: gz, wing }) => {
    const c3 = new THREE.Color(wing.color);
    const gm = new THREE.MeshBasicMaterial({ color: c3.clone().multiplyScalar(3), toneMapped: false });
    const g1 = new THREE.Mesh(gateGeo, gm); g1.position.set(0, 0, gz); root.add(g1);
    const g2 = new THREE.Mesh(gateGeo2, new THREE.MeshBasicMaterial({ color: c3.clone().multiplyScalar(1.5), toneMapped: false, transparent: true, opacity: 0.6 }));
    g2.position.set(0, 0, gz); root.add(g2);
    const tex = textTexture([
      { text: wing.name, size: 200, y: 200, spacing: 40 },
      { text: wing.sub, size: 76, y: 390, weight: 700, font: '"Noto Sans JP","Hiragino Sans",sans-serif', alpha: 0.85, spacing: 10 },
    ], wing.color);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
    sign.position.set(0, 5.6, gz); root.add(sign);
    const light = new THREE.PointLight(c3, 18, 16, 1.6); light.position.set(0, 4, gz - 3); root.add(light);
    updaters.push((t) => { g2.rotation.z = Math.sin(t * 0.8 + gz) * 0.03; gm.color.copy(c3).multiplyScalar(2.6 + Math.sin(t * 2 + gz) * 0.6); });
  });

  // ---------- エントランスタイトル ----------
  const title = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshBasicMaterial({
    map: textTexture([
      { text: 'FLAT TRAIL', size: 250, y: 210, spacing: 60 },
      { text: 'THE MUSEUM OF AI HEADLINES  2022 — 2026', size: 64, y: 400, weight: 600, alpha: 0.8, spacing: 18 },
    ], '#38e8ff'), transparent: true, toneMapped: false, depthWrite: false,
  }));
  title.position.set(0, 4.1, -2); root.add(title);

  // ---------- 終端アトリウム: 巨大コア ----------
  const coreGroup = new THREE.Group(); coreGroup.position.set(0, 3.2, endZ - 2); root.add(coreGroup);
  const coreMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `uniform float uTime; varying vec3 vN; varying vec3 vV; varying float vD;
      void main(){ vec3 p = position; float d = sin(p.x*4.+uTime*1.3)*sin(p.y*4.+uTime*1.1)*sin(p.z*4.+uTime*.9); vD=d;
        p += normal * d * 0.22; vec4 w = modelMatrix*vec4(p,1.); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition-w.xyz);
        gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uTime; varying vec3 vN; varying vec3 vV; varying float vD;
      void main(){ float f = pow(1.-abs(dot(normalize(vN),vV)),2.); vec3 c = mix(vec3(1.,.29,.37), vec3(.22,.91,1.), .5+.5*sin(vD*6.+uTime));
        gl_FragColor = vec4(c*(1.5+f*3.), f*.9+.05); }`,
  });
  const coreMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 24), coreMat);
  coreGroup.add(coreMesh);
  const orbitMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 2.5, 3), toneMapped: false, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  const orbits = [2.3, 2.8, 3.4].map((r, i) => { const o = new THREE.Mesh(new THREE.TorusGeometry(r, 0.01, 6, 160), orbitMat); coreGroup.add(o); return o; });
  const endSign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), new THREE.MeshBasicMaterial({
    map: textTexture([
      { text: 'THE TRAIL CONTINUES', size: 150, y: 200, spacing: 30 },
      { text: '次のヘッドラインは、まだ誰も知らない。', size: 80, y: 390, weight: 700, font: '"Noto Sans JP","Hiragino Sans",sans-serif', alpha: 0.9 },
    ], '#ff4a5e'), transparent: true, toneMapped: false, depthWrite: false,
  }));
  endSign.position.set(0, 6.3, endZ - 1.5); root.add(endSign);
  const coreLight = new THREE.PointLight(0xff6a8a, 40, 24, 1.5); coreLight.position.set(0, 3, endZ); root.add(coreLight);
  updaters.push((t) => {
    coreMat.uniforms.uTime.value = t; coreMesh.rotation.y = t * 0.15;
    orbits.forEach((o, i) => o.rotation.set(t * (0.2 + i * 0.1), t * (0.3 - i * 0.07), i));
  });

  // ---------- 照明 ----------
  root.add(new THREE.HemisphereLight(0x7088ff, 0x05060a, 0.35));

  // ---------- カメラパス ----------
  const entrance = { pos: new THREE.Vector3(0, 1.8, 7), look: new THREE.Vector3(0, 3.4, -4) };
  viewPoints.push(entrance.pos); stops.push({ look: entrance.look, kind: 'intro' });
  exhibits.forEach((e, i) => {
    viewPoints.push(e.viewPos); stops.push({ look: e.anchor, kind: 'exhibit', index: i });
  });
  const finale = { pos: new THREE.Vector3(0, 2.2, endZ + 9), look: new THREE.Vector3(0, 3.6, endZ - 2) };
  viewPoints.push(finale.pos); stops.push({ look: finale.look, kind: 'finale' });
  const path = new THREE.CatmullRomCurve3(viewPoints, false, 'centripetal', 0.5);
  stops.forEach((s, k) => { s.t = k / (viewPoints.length - 1); s.pos = viewPoints[k]; });

  return {
    root, exhibits, path, stops, endZ,
    update(t, dt, focusIndex) {
      for (let i = 0; i < exhibits.length; i++) {
        const ud = exhibits[i].mesh.userData;
        ud.focusTarget = i === focusIndex ? 1 : 0;
        ud.update(t, dt);
      }
      for (const u of updaters) u(t, dt);
    },
  };
}
