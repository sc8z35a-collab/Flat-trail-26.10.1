// post.js — Owner: A
// RenderPass → UnrealBloom → 最終合成（色収差・ビネット・グレイン・スキャンライン・ワープ歪み・トランジションフラッシュ）→ OutputPass
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    uAberr: { value: 0.0015 }, uWarp: { value: 0 }, uFlash: { value: 0 }, uGrain: { value: 0.05 }, uVig: { value: 1.0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes;
    uniform float uAberr; uniform float uWarp; uniform float uFlash; uniform float uGrain; uniform float uVig;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv; vec2 c = uv - 0.5; float r2 = dot(c,c);
      // ワープ（移動時の放射ブラー＋樽型）
      uv = 0.5 + c * (1.0 - uWarp * 0.08 * r2);
      float ab = uAberr + uWarp * 0.006;
      vec2 dir = normalize(c + 1e-5) * ab * (0.3 + r2 * 2.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir).b;
      if (uWarp > 0.01) {
        vec3 acc = vec3(0.0);
        for (int i = 1; i <= 6; i++) { float k = float(i) / 6.0; acc += texture2D(tDiffuse, mix(uv, vec2(0.5), k * 0.06 * uWarp)).rgb; }
        col = mix(col, acc / 6.0, clamp(uWarp, 0.0, 0.8));
      }
      // スキャンライン
      col *= 0.96 + 0.04 * sin(vUv.y * uRes.y * 1.6 + uTime * 8.0);
      // ビネット
      col *= mix(1.0, smoothstep(0.85, 0.2, length(c * vec2(1.0, 0.85))), 0.65 * uVig);
      // フラッシュ
      col += vec3(0.75, 0.9, 1.0) * uFlash;
      // グレイン
      col += (hash(vUv * uRes + fract(uTime) * 100.0) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createPost(renderer, scene, camera, quality = 'high') {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.95, 0.65, 0.82);
  composer.addPass(bloom);
  const final = new ShaderPass(FinalShader);
  composer.addPass(final);
  composer.addPass(new OutputPass());

  const st = { warp: 0, warpT: 0, flash: 0 };
  function applyQuality(q) {
    bloom.enabled = q !== 'low';
    bloom.strength = q === 'high' ? 0.95 : 0.75;
    final.uniforms.uGrain.value = q === 'low' ? 0.025 : 0.05;
  }
  applyQuality(quality);

  return {
    composer, bloom,
    setQuality: applyQuality,
    setWarp(v) { st.warpT = v; },
    flash(v = 0.6) { st.flash = Math.max(st.flash, v); },
    resize(w, h) {
      composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
      final.uniforms.uRes.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    },
    render(t, dt) {
      st.warp += (st.warpT - st.warp) * Math.min(1, dt * 6);
      st.flash *= Math.exp(-dt * 4);
      final.uniforms.uTime.value = t; final.uniforms.uWarp.value = st.warp; final.uniforms.uFlash.value = st.flash;
      composer.render(dt);
    },
  };
}
