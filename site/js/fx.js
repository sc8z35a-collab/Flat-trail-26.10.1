// fx.js — Owner: D
// GPUパーティクル（浮遊ダスト / データストリーム / バースト）と天井のボリューム光芒。CPUで頂点を更新しない。
import * as THREE from 'three';

const dustVert = /* glsl */`
  uniform float uTime; uniform float uPixel; uniform float uLen;
  attribute float aSeed; attribute vec3 aColor;
  varying vec3 vColor; varying float vA;
  void main(){
    vec3 p = position;
    p.y = mod(p.y + uTime * (0.08 + aSeed*0.15), 7.0);
    p.x += sin(uTime*0.3 + aSeed*40.0) * 0.4;
    p.z += cos(uTime*0.25 + aSeed*31.0) * 0.4;
    vec4 mv = modelViewMatrix * vec4(p,1.0);
    gl_Position = projectionMatrix * mv;
    float tw = 0.5 + 0.5*sin(uTime*(1.5+aSeed*3.0) + aSeed*100.0);
    gl_PointSize = (2.0 + aSeed*5.0) * uPixel * (6.0 / -mv.z) * (0.6+tw*0.6);
    vColor = aColor; vA = tw * smoothstep(0.0,0.6,p.y) * smoothstep(7.0,5.5,p.y);
  }`;
const dustFrag = /* glsl */`
  varying vec3 vColor; varying float vA;
  void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c);
    float a = smoothstep(0.5, 0.0, d); a = a*a;
    gl_FragColor = vec4(vColor * 2.2, a * vA); }`;

const streamVert = /* glsl */`
  uniform float uTime; uniform float uPixel; uniform float uLen; uniform float uZ0;
  attribute float aSeed; attribute float aLane;
  varying float vA; varying float vH;
  void main(){
    vec3 p = position;
    float speed = 3.0 + aSeed * 6.0;
    p.z = uZ0 - mod(aSeed*uLen + uTime*speed, uLen);
    vec4 mv = modelViewMatrix * vec4(p,1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.5 + aSeed*2.5) * uPixel * (6.0 / -mv.z);
    vA = 0.5 + 0.5*sin(aSeed*500.0 + uTime*4.0);
    vH = clamp(-p.z / uLen, 0.0, 1.0);
  }`;
const streamFrag = /* glsl */`
  varying float vA; varying float vH;
  vec3 pal(float k){ vec3 a=vec3(0.22,0.91,1.0), b=vec3(0.54,0.48,1.0), c=vec3(1.0,0.37,0.82), d=vec3(1.0,0.71,0.28), e=vec3(1.0,0.29,0.37);
    if(k<.25) return mix(a,b,k/.25); if(k<.5) return mix(b,c,(k-.25)/.25); if(k<.75) return mix(c,d,(k-.5)/.25); return mix(d,e,(k-.75)/.25); }
  void main(){ vec2 c = gl_PointCoord-0.5; float a = smoothstep(0.5,0.0,length(c));
    gl_FragColor = vec4(pal(vH)*3.0, a*vA*0.9); }`;

const burstVert = /* glsl */`
  uniform float uT; uniform float uPixel; attribute vec3 aDir; attribute float aSeed;
  varying float vA;
  void main(){
    float t = uT; vec3 p = position + aDir * (1.0 - exp(-t*3.0)) * (1.2 + aSeed*1.8);
    p.y += t*t*0.3 - t*0.2;
    vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv;
    gl_PointSize = (3.0 + aSeed*4.0) * uPixel * (6.0 / -mv.z) * (1.0 - t*0.6);
    vA = 1.0 - smoothstep(0.2, 1.4, t);
  }`;
const burstFrag = /* glsl */`
  uniform vec3 uColor; varying float vA;
  void main(){ vec2 c=gl_PointCoord-0.5; float a = smoothstep(0.5,0.0,length(c));
    gl_FragColor = vec4(uColor*3.0, a*vA); }`;

const shaftVert = /* glsl */`
  varying vec2 vUv; varying vec3 vP;
  void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.); vP = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;
const shaftFrag = /* glsl */`
  uniform float uTime; varying vec2 vUv; varying vec3 vP;
  float hash(float n){ return fract(sin(n)*43758.5453); }
  void main(){
    float x = vUv.x;
    float rays = 0.0;
    for(int i=0;i<5;i++){ float fi=float(i); float c = 0.15+0.7*hash(fi*7.1+floor(vP.z/40.0));
      rays += smoothstep(0.06,0.0,abs(x-c-0.03*sin(uTime*0.2+fi))) * (0.5+0.5*sin(uTime*0.3+fi*2.0)); }
    float fall = smoothstep(0.0, 1.0, vUv.y);
    gl_FragColor = vec4(vec3(0.55,0.7,1.0)*rays*fall*0.10, 1.0);
  }`;

export function createFX(scene, renderer, { length = 220, z0 = 12, count = 2600 } = {}) {
  const pixel = renderer.getPixelRatio();
  const group = new THREE.Group(); group.name = 'fx'; scene.add(group);
  const palette = ['#38e8ff', '#8a7bff', '#ff5fd2', '#ffb547', '#ff4a5e', '#ffffff'].map(c => new THREE.Color(c));

  // 浮遊ダスト
  const pos = new Float32Array(count * 3), seed = new Float32Array(count), colr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 11;
    pos[i * 3 + 1] = Math.random() * 7;
    pos[i * 3 + 2] = z0 - Math.random() * length;
    seed[i] = Math.random();
    const k = Math.min(4, Math.floor(((z0 - pos[i * 3 + 2]) / length) * 5));
    const c = Math.random() < 0.25 ? palette[5] : palette[k];
    colr.set([c.r, c.g, c.b], i * 3);
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  dg.setAttribute('aColor', new THREE.BufferAttribute(colr, 3));
  const dustU = { uTime: { value: 0 }, uPixel: { value: pixel }, uLen: { value: length } };
  const dust = new THREE.Points(dg, new THREE.ShaderMaterial({
    uniforms: dustU, vertexShader: dustVert, fragmentShader: dustFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  dust.frustumCulled = false; group.add(dust);

  // データストリーム（天井付近と床際を流れる光の粒）
  const SN = 1400;
  const sp = new Float32Array(SN * 3), ss = new Float32Array(SN), sl = new Float32Array(SN);
  const lanes = [[-5.4, 6.9], [5.4, 6.9], [-5.6, 0.25], [5.6, 0.25], [-2.0, 7.0], [2.0, 7.0]];
  for (let i = 0; i < SN; i++) {
    const L = lanes[i % lanes.length];
    sp[i * 3] = L[0] + (Math.random() - 0.5) * 0.15; sp[i * 3 + 1] = L[1] + (Math.random() - 0.5) * 0.1; sp[i * 3 + 2] = 0;
    ss[i] = Math.random(); sl[i] = i % lanes.length;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sg.setAttribute('aSeed', new THREE.BufferAttribute(ss, 1));
  sg.setAttribute('aLane', new THREE.BufferAttribute(sl, 1));
  const streamU = { uTime: { value: 0 }, uPixel: { value: pixel }, uLen: { value: length }, uZ0: { value: z0 } };
  const stream = new THREE.Points(sg, new THREE.ShaderMaterial({
    uniforms: streamU, vertexShader: streamVert, fragmentShader: streamFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  stream.frustumCulled = false; group.add(stream);

  // 光芒（天井から差す斜めの光）
  const shaftU = { uTime: { value: 0 } };
  const shaftMat = new THREE.ShaderMaterial({ uniforms: shaftU, vertexShader: shaftVert, fragmentShader: shaftFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  for (let z = z0 - 20; z > z0 - length; z -= 40) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(11, 7.5), shaftMat);
    s.position.set(0, 3.7, z); s.rotation.x = -0.25; group.add(s);
  }

  // バースト（プール8個）
  const BN = 220;
  const bursts = [];
  const bdir = new Float32Array(BN * 3), bseed = new Float32Array(BN), bpos = new Float32Array(BN * 3);
  for (let i = 0; i < BN; i++) {
    const v = new THREE.Vector3().randomDirection(); bdir.set([v.x, v.y, v.z], i * 3); bseed[i] = Math.random();
  }
  const bgeo = new THREE.BufferGeometry();
  bgeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
  bgeo.setAttribute('aDir', new THREE.BufferAttribute(bdir, 3));
  bgeo.setAttribute('aSeed', new THREE.BufferAttribute(bseed, 1));
  for (let i = 0; i < 8; i++) {
    const u = { uT: { value: 9 }, uPixel: { value: pixel }, uColor: { value: new THREE.Color() } };
    const p = new THREE.Points(bgeo, new THREE.ShaderMaterial({ uniforms: u, vertexShader: burstVert, fragmentShader: burstFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    p.frustumCulled = false; p.visible = false; group.add(p); bursts.push({ p, u });
  }
  let bi = 0;

  return {
    group,
    setDensity(q) { dg.setDrawRange(0, Math.floor(count * q)); sg.setDrawRange(0, Math.floor(SN * q)); },
    setPixelRatio(pr) { dustU.uPixel.value = streamU.uPixel.value = pr; bursts.forEach(b => (b.u.uPixel.value = pr)); },
    burst(position, color) {
      const b = bursts[bi++ % bursts.length];
      b.p.position.copy(position); b.u.uColor.value.set(color); b.u.uT.value = 0; b.p.visible = true;
    },
    update(t, dt) {
      dustU.uTime.value = t; streamU.uTime.value = t; shaftU.uTime.value = t;
      for (const b of bursts) if (b.p.visible) { b.u.uT.value += dt; if (b.u.uT.value > 1.6) b.p.visible = false; }
    },
  };
}
