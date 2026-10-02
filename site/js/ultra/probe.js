// ultra/probe.js — Owner: ABYSS
// 実空間リフレクションプローブ: カメラ位置でホール自身を CubeCamera で撮影 → PMREM → scene.environment。
// RoomEnvironment(汎用スタジオ) の映り込みではなく「この美術館の壁・天窓・絵画・金具」が真鍮や大理石やガラスに映る。
//  - 撮影は到着時/起動時のみ（毎フレームはしない）。新旧プローブを environmentRotation 無しでクロスフェードは不可なので、
//    PMREM の RT を2枚持ち、environmentIntensity を一瞬落として差し替える（目立たない）
//  - 撮影時は fx・反射レイヤ・userData.noProbe を隠す
import * as THREE from 'three';

export function createProbe({ scene, renderer, size = 256, base = null }) {
  const cubeRT = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
  const cam = new THREE.CubeCamera(0.08, 120, cubeRT);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let current = null, enabled = true, intensity = 1;
  const hidden = [];
  const fallback = base; // 失敗時/無効時に戻す環境
  let blend = 1;

  function capture(pos) {
    if (!enabled) return null;
    cam.position.copy(pos);
    hidden.length = 0;
    scene.traverse(o => { if (o.visible && (o.userData?.noProbe || /^fx-|^ultra-/.test(o.name || ''))) { o.visible = false; hidden.push(o); } });
    const prevEnv = scene.environment, prevFog = scene.fog;
    scene.fog = null; // 霧はプローブに焼き込まない（二重霧を防ぐ）
    const autoS = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
    try { cam.update(renderer, scene); } finally {
      renderer.shadowMap.autoUpdate = autoS; scene.fog = prevFog; for (const o of hidden) o.visible = true;
    }
    const rt = pmrem.fromCubemap(cubeRT.texture);
    const old = current; current = rt;
    scene.environment = rt.texture;
    if (old) old.dispose();
    blend = 0; // 差し替え直後は明るさを少し落として馴染ませる
    void prevEnv;
    return rt.texture;
  }
  return {
    capture,
    update(dt) {
      if (blend < 1) { blend = Math.min(1, blend + dt * 1.5); scene.environmentIntensity = intensity * (0.75 + 0.25 * blend); }
    },
    setIntensity(v) { intensity = v; scene.environmentIntensity = v; },
    setEnabled(on) {
      enabled = on;
      if (!on && fallback) { scene.environment = fallback; current?.dispose(); current = null; }
    },
    dispose() { cubeRT.dispose(); pmrem.dispose(); current?.dispose(); },
  };
}
