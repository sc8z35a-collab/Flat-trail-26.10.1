// ultra/reflect.js — Owner: ABYSS
// 磨き石床のリアルタイム平面反射（ULTRA 専用）。床マテリアル(museum 所有)には触れず、
// 床直上 2mm に「反射レイヤ」を重ねる: 反射RTを粗さ相当でボカし、フレネル＋床の明度で減衰させて加算合成。
//  - 反射カメラは Reflector と同じ斜め近クリップ（oblique clip）で床下を切る
//  - 反射の描画は 1/2 解像度 + MSAA。fx（光芒など）と自分自身は反射に写さない
//  - 遠方は霞に溶かす（距離フェード）・視線が浅いほど強く（Schlick フレネル）
import * as THREE from 'three';

const VS = /* glsl */`
  uniform mat4 textureMatrix; varying vec4 vUvR; varying vec3 vWorld; varying vec2 vUv;
  void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vUvR = textureMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * viewMatrix * w; }`;
const FS = /* glsl */`
  uniform sampler2D tRefl; uniform vec2 uTexel; uniform float uStrength; uniform float uRough; uniform vec3 uTint; uniform float uFar;
  varying vec4 vUvR; varying vec3 vWorld; varying vec2 vUv;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
  void main(){
    vec3 V = normalize(cameraPosition - vWorld);
    float cosT = clamp(V.y, 0.0, 1.0);
    float fres = 0.04 + 0.96 * pow(1.0 - cosT, 5.0);                 // Schlick (F0=0.04: 研磨石)
    // 石目のマイクロ粗さで反射を微妙に揺らす（完全な鏡にしない）
    vec2 jitter = (vec2(noise(vWorld.xz * 3.1), noise(vWorld.zx * 2.7 + 7.0)) - 0.5) * 0.004 * uRough;
    vec2 uv = vUvR.xy / vUvR.w + jitter;
    // 粗さに応じた 13 タップのディスクぼかし（視線が浅いほど縦に伸びる＝実際の光沢床の異方性ボケ）
    float r = uRough * (1.0 + 2.5 * cosT);
    vec3 acc = texture2D(tRefl, uv).rgb; float w = 1.0;
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 2.39996; float rr = sqrt((float(i) + 0.5) / 12.0) * r;
      vec2 o = vec2(cos(a) * 0.6, sin(a) * 1.6) * rr * uTexel * 6.0;
      acc += texture2D(tRefl, uv + o).rgb; w += 1.0;
    }
    vec3 refl = acc / w;
    float dist = length(cameraPosition - vWorld);
    float fade = 1.0 - smoothstep(uFar * 0.45, uFar, dist);
    float a = clamp(fres * uStrength * fade, 0.0, 0.85);
    gl_FragColor = vec4(refl * uTint * a, 1.0);   // premultiplied additive
  }`;

export function createFloorReflection({ scene, renderer, camera, museum, y = 0.002, strength = 0.9, rough = 0.6 }) {
  const hall = museum.hall || { width: 10 };
  const z0 = 16, z1 = (museum.endZ ?? -200) - 4;
  const len = z0 - z1, width = (hall.width || 10) - 0.06;
  const geo = new THREE.PlaneGeometry(width, len);
  geo.rotateX(-Math.PI / 2); geo.translate(0, 0, (z0 + z1) / 2);

  const res = new THREE.Vector2();
  const rt = new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType, samples: 4 });
  const textureMatrix = new THREE.Matrix4();
  const mat = new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: {
      tRefl: { value: rt.texture }, textureMatrix: { value: textureMatrix }, uTexel: { value: new THREE.Vector2(1 / 256, 1 / 256) },
      uStrength: { value: strength }, uRough: { value: rough }, uTint: { value: new THREE.Color(0xfff4e6) }, uFar: { value: 38 },
    },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = y; mesh.renderOrder = 2; mesh.name = 'ultra-floor-reflection';
  mesh.userData.noAO = true; mesh.frustumCulled = false;
  scene.add(mesh);

  const rcam = new THREE.PerspectiveCamera();
  const plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4();
  const N = new THREE.Vector3(0, 1, 0), P = new THREE.Vector3(0, y, 0);
  const camPos = new THREE.Vector3(), look = new THREE.Vector3(), tgt = new THREE.Vector3(), rot = new THREE.Matrix4();
  let enabled = true, scale = 0.5, hidden = [];

  mesh.onBeforeRender = (r, sc, cam) => {
    if (!enabled || cam !== camera) return;
    // 反射カメラ（床で鏡映）
    camPos.setFromMatrixPosition(cam.matrixWorld);
    if (camPos.y < y) return;
    rot.extractRotation(cam.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rot).add(camPos);
    rcam.position.set(camPos.x, 2 * y - camPos.y, camPos.z);
    tgt.set(look.x, 2 * y - look.y, look.z);
    rcam.up.set(0, 1, 0).applyMatrix4(rot); rcam.up.y *= -1;
    rcam.lookAt(tgt);
    rcam.far = cam.far; rcam.near = cam.near;
    rcam.updateMatrixWorld();
    rcam.projectionMatrix.copy(cam.projectionMatrix);
    textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    textureMatrix.multiply(rcam.projectionMatrix).multiply(rcam.matrixWorldInverse).multiply(mesh.matrixWorld);
    // 斜め近クリップ
    plane.setFromNormalAndCoplanarPoint(N, P).applyMatrix4(rcam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = rcam.projectionMatrix.elements;
    q.x = (Math.sign(clip.x) + pm[8]) / pm[0]; q.y = (Math.sign(clip.y) + pm[9]) / pm[5]; q.z = -1; q.w = (1 + pm[10]) / pm[14];
    clip.multiplyScalar(2 / clip.dot(q));
    pm[2] = clip.x; pm[6] = clip.y; pm[10] = clip.z + 1 - 0.003; pm[14] = clip.w;
    // fx（光芒・光だまり・埃）と自分を隠して描画
    hidden.length = 0;
    sc.traverse(o => { if (o.visible && (o === mesh || o.userData?.noReflect || /^fx-/.test(o.name || ''))) { o.visible = false; hidden.push(o); } });
    const prevRT = r.getRenderTarget(), prevAuto = r.shadowMap.autoUpdate, prevNeeds = r.shadowMap.needsUpdate;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(rt); r.state.buffers.depth.setMask(true); r.clear();
    r.render(sc, rcam);
    r.setRenderTarget(prevRT); r.shadowMap.autoUpdate = prevAuto; r.shadowMap.needsUpdate = prevNeeds;
    for (const o of hidden) o.visible = true;
    if (cam.viewport) r.state.viewport(cam.viewport);
  };

  function resize() {
    renderer.getDrawingBufferSize(res);
    const w = Math.max(64, Math.round(res.x * scale)), h = Math.max(64, Math.round(res.y * scale));
    rt.setSize(w, h); mat.uniforms.uTexel.value.set(1 / w, 1 / h);
  }
  resize();
  return {
    mesh,
    resize,
    setQuality(qq) {
      enabled = qq === 'ultra' || qq === 'high';
      mesh.visible = enabled;
      scale = qq === 'ultra' ? 0.6 : 0.4;
      mat.uniforms.uStrength.value = qq === 'ultra' ? strength : strength * 0.7;
      resize();
    },
    dispose() { scene.remove(mesh); rt.dispose(); geo.dispose(); mat.dispose(); },
  };
}
