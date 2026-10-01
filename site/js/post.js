// post.js — Owner: A（非ネオン版）
// RenderPass → (SAO: high only) → 柔らかいBloom(高threshold) → 最終合成
//   最終合成: 擬似被写界深度(深度なし・画面周辺ボケ+注視点フォーカス) / 移動時のモーションソフトブラー / 暖色フィルムトーン / ハレーション / 微細グレイン / ビネット / 入館フェード
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    uMotion: { value: 0 }, uFade: { value: 0 }, uGrain: { value: 0.025 }, uVig: { value: 1.0 },
    uFocus: { value: new THREE.Vector2(0.5, 0.5) }, uDof: { value: 1.0 }, uWhite: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes;
    uniform float uMotion; uniform float uFade; uniform float uGrain; uniform float uVig; uniform vec2 uFocus; uniform float uDof; uniform float uWhite;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    vec3 sampleBlur(vec2 uv, float r){
      // 12タップのゴールデンアングル・ボケ（円形）
      vec3 acc = texture2D(tDiffuse, uv).rgb; float w = 1.0;
      for (int i = 0; i < 12; i++) {
        float fi = float(i); float a = fi * 2.39996; float rr = sqrt((fi + 0.5) / 12.0) * r;
        vec2 o = vec2(cos(a), sin(a)) * rr / vec2(uRes.x/uRes.y, 1.0);
        vec3 s = texture2D(tDiffuse, uv + o).rgb; float sw = 1.0 + dot(s, vec3(0.3)) ; // 明部をわずかに重く＝ボケが丸く光る
        acc += s * sw; w += sw;
      }
      return acc / w;
    }
    void main(){
      vec2 uv = vUv; vec2 c = uv - 0.5;
      // 擬似DOF: 注視点から離れるほどボケ。移動中は全体に薄く。
      float d = length((uv - uFocus) * vec2(uRes.x/uRes.y, 1.0));
      float coc = smoothstep(0.28, 0.95, d) * 0.010 * uDof + uMotion * 0.006;
      vec3 col = coc > 0.0004 ? sampleBlur(uv, coc) : texture2D(tDiffuse, uv).rgb;
      // 移動時の放射方向ソフトブラー（ワープではなく、カメラの前進感のみ）
      if (uMotion > 0.02) {
        vec3 acc = vec3(0.0);
        for (int i = 0; i < 5; i++) { float k = float(i) / 5.0; acc += texture2D(tDiffuse, mix(uv, vec2(0.5), k * 0.025 * uMotion)).rgb; }
        col = mix(col, acc / 5.0, 0.5 * uMotion);
      }
      // ハレーション（明部に暖色の滲み）
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col += vec3(1.0, 0.55, 0.3) * smoothstep(0.75, 1.4, l) * 0.06;
      // 暖色フィルム調: シャドウをわずかに冷たく、ハイライトを暖かく
      col = mix(col * vec3(0.97, 0.99, 1.03), col * vec3(1.04, 1.0, 0.94), smoothstep(0.1, 0.8, l));
      col = mix(vec3(l), col, 0.94); // 彩度を少しだけ抑える
      // ビネット（柔らかい）
      col *= mix(1.0, smoothstep(0.95, 0.25, length(c * vec2(1.0, 0.9))), 0.45 * uVig);
      // グレイン（輝度依存、暗部ほど強い）
      col += (hash(vUv * uRes + fract(uTime * 7.0) * 100.0) - 0.5) * uGrain * (1.2 - l);
      // フェード（黒）/ 白フラッシュ（入館時）
      col = mix(col, vec3(1.0, 0.98, 0.95), uWhite);
      col *= 1.0 - uFade;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createPost(renderer, scene, camera, quality = 'high') {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.35, 0.6, 0.9);
  composer.addPass(bloom);
  const final = new ShaderPass(FinalShader);
  composer.addPass(final);
  composer.addPass(new OutputPass());

  const st = { motion: 0, motionT: 0, white: 0, fade: 1, fadeT: 0, dof: 1, dofT: 1 };
  const focusT = new THREE.Vector2(0.5, 0.5);
  const tmp = new THREE.Vector3();

  function applyQuality(q) {
    bloom.enabled = q !== 'low';
    bloom.strength = q === 'high' ? 0.38 : 0.28;
    final.uniforms.uDof.value = q === 'low' ? 0 : 1;
    st.dofT = q === 'low' ? 0 : 1;
  }
  applyQuality(quality);

  return {
    composer, bloom,
    setQuality: applyQuality,
    setWarp(v) { st.motionT = v; },          // 互換API（移動中=1）
    setMotion(v) { st.motionT = v; },
    flash(v = 0.3) { st.white = Math.max(st.white, v); },
    fadeIn() { st.fadeT = 0; }, fadeOut() { st.fadeT = 1; },
    /** world座標の注視点を画面上のフォーカス位置に */
    setFocusWorld(v3) {
      if (!v3) { focusT.set(0.5, 0.5); return; }
      tmp.copy(v3).project(camera);
      if (tmp.z > 1) { focusT.set(0.5, 0.5); return; }
      focusT.set(THREE.MathUtils.clamp(tmp.x * 0.5 + 0.5, 0.1, 0.9), THREE.MathUtils.clamp(tmp.y * 0.5 + 0.5, 0.1, 0.9));
    },
    resize(w, h) {
      composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
      final.uniforms.uRes.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    },
    render(t, dt) {
      const k = Math.min(1, dt * 5);
      st.motion += (st.motionT - st.motion) * k;
      st.white *= Math.exp(-dt * 2.5);
      st.fade += (st.fadeT - st.fade) * Math.min(1, dt * 1.5);
      final.uniforms.uFocus.value.lerp(focusT, Math.min(1, dt * 3));
      const u = final.uniforms;
      u.uTime.value = t; u.uMotion.value = st.motion; u.uWhite.value = st.white; u.uFade.value = st.fade;
      composer.render(dt);
    },
  };
}
