// ultra/post_ultra.js — Owner: ABYSS（post.js の createPost 完全互換・差し替え用。A が main/world で import 先を選ぶ）
// ULTRA パイプライン（非ネオン・写真的レンズ表現）
//   RenderPass(HalfFloat + MSAA×4)
//   → GTAO（地面接触・入隅の環境遮蔽。透明物/fx/粒子は G-buffer から除外）
//   → [slot: beforeBloom]（D の上位パスを差し込む口）
//   → UnrealBloom（高 threshold・柔らかく）
//   → [slot: afterBloom]
//   → Lens（最終合成: 深度ベース被写界深度ボケ / 移動ブラー / 微弱な軸上色収差 / ハレーション / フィルムトーン / ビネット / グレイン）
//   → [slot: final]
//   → CAS シャープ + ディザ（OutputPass 相当: トーンマップ & sRGB 変換）
// 互換 API: render(t,dt) resize(w,h) setQuality(q) setMotion(v) setWarp(v) flash(v) fadeIn() fadeOut() setFocusWorld(v3|null)
// 追加 API: composer, addPass(pass, slot), depthTexture(getter), setProfile(p), setFocusDistance(m), gtao, bloom, lens
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

// GTAO: 透明物・fx(光芒/光だまり)・粒子・userData.noAO を G-buffer から除外（光芒の箱が AO を落とす事故を防ぐ）
class MuseumGTAOPass extends GTAOPass {
  _overrideVisibility() {
    const cache = this._visibilityCache;
    this.scene.traverse((o) => {
      if (!o.visible) return;
      const m = o.material;
      const transparent = m && (Array.isArray(m) ? m.some(x => x.transparent) : m.transparent);
      if (o.isPoints || o.isLine || o.isLine2 || o.isSprite || o.userData?.noAO || (o.isMesh && transparent)) { o.visible = false; cache.push(o); }
    });
  }
}

const LensShader = {
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: null }, uHasDepth: { value: 0 },
    uNear: { value: 0.05 }, uFar: { value: 200 },
    uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    uMotion: { value: 0 }, uFade: { value: 0 }, uGrain: { value: 0.022 }, uVig: { value: 1.0 },
    uFocus: { value: new THREE.Vector2(0.5, 0.5) }, uFocusDist: { value: 3.2 }, uAperture: { value: 1.0 },
    uDof: { value: 1.0 }, uWhite: { value: 0 }, uCA: { value: 1.0 }, uTaps: { value: 24 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: /* glsl */`
    #include <packing>
    uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform float uHasDepth; uniform float uNear; uniform float uFar;
    uniform float uTime; uniform vec2 uRes; uniform float uMotion; uniform float uFade; uniform float uGrain; uniform float uVig;
    uniform vec2 uFocus; uniform float uFocusDist; uniform float uAperture; uniform float uDof; uniform float uWhite; uniform float uCA; uniform int uTaps;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    float viewDist(vec2 uv){
      float d = texture2D(tDepth, uv).x;
      return -perspectiveDepthToViewZ(d, uNear, uFar);
    }
    // 薄レンズ近似の錯乱円（画面高さ比）。前ボケは少し強め・遠景は飽和
    float cocAt(float z){
      float c = (z - uFocusDist) / max(z, 0.001);
      c = c < 0.0 ? c * 1.35 : c;
      return clamp(abs(c) * 0.018 * uAperture, 0.0, 0.016);
    }
    void main(){
      vec2 uv = vUv; vec2 c = uv - 0.5; float aspect = uRes.x / uRes.y;
      vec3 base = texture2D(tDiffuse, uv).rgb;
      float coc;
      if (uHasDepth > 0.5) {
        coc = cocAt(viewDist(uv)) * uDof;
      } else { // 深度が無い品質: 画面上の注視点からの距離で擬似DOF
        float d = length((uv - uFocus) * vec2(aspect, 1.0));
        coc = smoothstep(0.28, 0.95, d) * 0.010 * uDof;
      }
      coc += uMotion * 0.005;
      vec3 col = base;
      if (coc > 0.0006) {
        // ゴールデンアングル螺旋の gather ボケ。サンプル側の CoC で重み付け（にじみ出し防止）＋明部重み＝丸ボケ
        vec3 acc = base; float w = 1.0; float rot = hash(uv * uRes) * 6.2831;
        for (int i = 0; i < 48; i++) {
          if (i >= uTaps) break;
          float fi = float(i); float a = fi * 2.39996 + rot; float rr = sqrt((fi + 0.5) / float(uTaps)) * coc;
          vec2 o = vec2(cos(a), sin(a)) * rr / vec2(aspect, 1.0);
          vec2 suv = uv + o;
          vec3 s = texture2D(tDiffuse, suv).rgb;
          float sw = 1.0;
          if (uHasDepth > 0.5) { float sc = cocAt(viewDist(suv)) * uDof + uMotion * 0.005; sw = smoothstep(rr * 0.5, rr + 0.0005, sc + 0.0004); }
          sw *= 1.0 + 2.0 * smoothstep(0.7, 2.5, dot(s, vec3(0.299, 0.587, 0.114)));
          acc += s * sw; w += sw;
        }
        col = acc / w;
      }
      // 軸上色収差（周辺のみ・ごく僅か。ネオン的な RGB ずれではなく実レンズの縁の滲み）
      if (uCA > 0.0) {
        vec2 dir = c * dot(c, c) * 0.0035 * uCA;
        col.r = mix(col.r, texture2D(tDiffuse, uv - dir).r, 0.65);
        col.b = mix(col.b, texture2D(tDiffuse, uv + dir).b, 0.65);
      }
      // 移動時の放射方向ソフトブラー（前進感のみ）
      if (uMotion > 0.02) {
        vec3 acc = vec3(0.0);
        for (int i = 0; i < 6; i++) { float k = float(i) / 6.0; acc += texture2D(tDiffuse, mix(uv, vec2(0.5), k * 0.03 * uMotion)).rgb; }
        col = mix(col, acc / 6.0, 0.45 * uMotion);
      }
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // ハレーション: 明部の縁が赤橙ににじむフィルムの特性
      col += vec3(1.0, 0.52, 0.28) * smoothstep(0.8, 1.6, l) * 0.05;
      // フィルムトーン: シャドウ冷/ハイライト暖、彩度ごく僅かに抑制
      col = mix(col * vec3(0.975, 0.99, 1.025), col * vec3(1.035, 1.0, 0.95), smoothstep(0.08, 0.85, l));
      col = mix(vec3(l), col, 0.95);
      // 光学ビネット（cos^4 近似）
      float r2 = dot(c * vec2(aspect / 1.6, 1.0), c * vec2(aspect / 1.6, 1.0));
      col *= mix(1.0, pow(1.0 / (1.0 + r2 * 1.6), 2.0), 0.55 * uVig);
      // グレイン（輝度依存、暗部ほど強い・時間変化）
      col += (hash(vUv * uRes + fract(uTime * 7.0) * 100.0) - 0.5) * uGrain * (1.15 - min(l, 1.0));
      col = mix(col, vec3(1.0, 0.985, 0.955) * 1.2, uWhite);
      col *= 1.0 - uFade;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

// AMD FidelityFX CAS 風の適応シャープ（OutputPass の後 = 表示空間で）＋ 8bit バンディング対策ディザ
const SharpenShader = {
  uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uAmount: { value: 0.35 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uAmount; varying vec2 vUv;
    void main(){
      vec2 px = 1.0 / uRes;
      vec3 a = texture2D(tDiffuse, vUv + vec2(0.0, -px.y)).rgb;
      vec3 b = texture2D(tDiffuse, vUv + vec2(-px.x, 0.0)).rgb;
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      vec3 d = texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb;
      vec3 e = texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb;
      vec3 mn = min(min(min(a, b), min(d, e)), c), mx = max(max(max(a, b), max(d, e)), c);
      vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, 1e-4), 0.0, 1.0));
      vec3 w = -amp * mix(0.125, 0.2, uAmount);
      vec3 col = (c + (a + b + d + e) * w) / (1.0 + 4.0 * w);
      col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createPost(renderer, scene, camera, quality = 'high') {
  const size = renderer.getSize(new THREE.Vector2());
  const pr = renderer.getPixelRatio();
  const isGL2 = renderer.capabilities.isWebGL2 !== false;
  const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: isGL2 ? 4 : 0 });
  const composer = new EffectComposer(renderer, rt);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const gtao = new MuseumGTAOPass(scene, camera, size.x * pr, size.y * pr);
  gtao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  gtao.blendIntensity = 0.85;
  composer.addPass(gtao);

  const slotBefore = [], slotAfter = [], slotFinal = [];
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.35, 0.6, 0.9);
  const lens = new ShaderPass(LensShader);
  const output = new OutputPass();
  const sharpen = new ShaderPass(SharpenShader);
  // 並び順を slot に従って組み直す（addPass 後も呼ぶ）
  function rebuild() {
    composer.passes.length = 0;
    [renderPass, gtao, ...slotBefore, bloom, ...slotAfter, lens, ...slotFinal, output, sharpen].forEach(p => composer.passes.push(p));
    const w = size.x * renderer.getPixelRatio(), h = size.y * renderer.getPixelRatio();
    composer.passes.forEach(p => p.setSize?.(w, h));
  }
  rebuild();

  const st = { motion: 0, motionT: 0, white: 0, fade: 1, fadeT: 0, focusDist: 3.2, focusDistT: 3.2 };
  const focusT = new THREE.Vector2(0.5, 0.5);
  const tmp = new THREE.Vector3();
  let prof = {};

  function applyQuality(q) {
    const ultra = q === 'ultra';
    const high = ultra || q === 'high';
    gtao.enabled = high && prof.ssao !== false;
    bloom.enabled = q !== 'low';
    bloom.strength = ultra ? 0.42 : high ? 0.38 : 0.28;
    bloom.radius = ultra ? 0.72 : 0.6;
    const u = lens.uniforms;
    u.uDof.value = q === 'low' ? 0 : 1;
    u.uTaps.value = ultra ? 40 : high ? 24 : 12;
    u.uCA.value = q === 'low' ? 0 : 1;
    sharpen.enabled = q !== 'low';
    sharpen.uniforms.uAmount.value = ultra ? 0.5 : 0.3;
    if (gtao.enabled) gtao.updateGtaoMaterial({ samples: ultra ? 24 : 12 });
  }
  applyQuality(quality);

  const api = {
    composer, bloom, gtao, lens, renderPass,
    get depthTexture() { return gtao.enabled ? gtao.depthTexture : null; },
    setQuality: (q) => applyQuality(q),
    setProfile(p) { prof = p || {}; },
    /** D 等の上位パスを差し込む。slot: 'beforeBloom' | 'afterBloom' | 'final' */
    addPass(pass, slot = 'afterBloom') {
      ({ beforeBloom: slotBefore, afterBloom: slotAfter, final: slotFinal }[slot] || slotAfter).push(pass);
      rebuild(); return pass;
    },
    removePass(pass) { [slotBefore, slotAfter, slotFinal].forEach(a => { const i = a.indexOf(pass); if (i >= 0) a.splice(i, 1); }); rebuild(); },
    setWarp(v) { st.motionT = v; },
    setMotion(v) { st.motionT = v; },
    flash(v = 0.3) { st.white = Math.max(st.white, v); },
    fadeIn() { st.fadeT = 0; }, fadeOut() { st.fadeT = 1; },
    setFocusDistance(m) { st.focusDistT = Math.max(0.4, m); },
    /** world 座標の注視点 → 画面上のフォーカス位置 + 合焦距離 */
    setFocusWorld(v3) {
      if (!v3) { focusT.set(0.5, 0.5); st.focusDistT = 4.5; return; }
      st.focusDistT = Math.max(0.6, camera.position.distanceTo(v3));
      tmp.copy(v3).project(camera);
      if (tmp.z > 1) { focusT.set(0.5, 0.5); return; }
      focusT.set(THREE.MathUtils.clamp(tmp.x * 0.5 + 0.5, 0.1, 0.9), THREE.MathUtils.clamp(tmp.y * 0.5 + 0.5, 0.1, 0.9));
    },
    resize(w, h) {
      size.set(w, h);
      const p = renderer.getPixelRatio();
      composer.setPixelRatio(p); composer.setSize(w, h);
      lens.uniforms.uRes.value.set(w * p, h * p);
      sharpen.uniforms.uRes.value.set(w * p, h * p);
    },
    render(t, dt) {
      const k = Math.min(1, dt * 5);
      st.motion += (st.motionT - st.motion) * k;
      st.white *= Math.exp(-dt * 2.5);
      st.fade += (st.fadeT - st.fade) * Math.min(1, dt * 1.5);
      st.focusDist += (st.focusDistT - st.focusDist) * Math.min(1, dt * 2.2); // ピント送り（オートフォーカスの“呼吸”）
      const u = lens.uniforms;
      u.uFocus.value.lerp(focusT, Math.min(1, dt * 3));
      u.uTime.value = t; u.uMotion.value = st.motion; u.uWhite.value = st.white; u.uFade.value = st.fade;
      u.uFocusDist.value = st.focusDist;
      u.uHasDepth.value = gtao.enabled ? 1 : 0;
      u.tDepth.value = gtao.enabled ? gtao.depthTexture : null;
      u.uNear.value = camera.near; u.uFar.value = camera.far;
      composer.render(dt);
    },
  };
  api.resize(size.x, size.y);
  return api;
}
