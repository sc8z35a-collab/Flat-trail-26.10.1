// assets.js — Owner: A。全ゾーン共有のキャッシュ付きアセットローダ（同じURLは1回だけ読み、GPUも共有）。
// 使い方（ゾーン内）: const t = await ctx.assets.tex('assets/arch/x.jpg', { srgb:true, repeat:[4,4] });
//   pbr(dir) は dir/{diff,nor,arm,rough,disp}.jpg のうち存在するものを読み、MeshStandard/Physical 用の props を返す。
//   gltf(url) は { scene(クローン), animations } を返す（元はキャッシュ、毎回 clone(true)）。
//   hdr(url) は PMREM 済みの環境テクスチャ。canvas(w,h,fn) は CanvasTexture（sRGB, mipmap, aniso）。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

export function createAssets(renderer) {
  const texLoader = new THREE.TextureLoader();
  const gltfLoader = new GLTFLoader();
  const hdrLoader = new HDRLoader();
  const cache = new Map();
  const maxAniso = renderer.capabilities.getMaxAnisotropy?.() || 1;
  let pmrem = null;
  const once = (key, f) => { if (!cache.has(key)) cache.set(key, f().catch((e) => { console.warn('[assets] failed', key, e?.message || e); cache.delete(key); throw e; })); return cache.get(key); };

  const loadTex = (url) => once('t:' + url, () => new Promise((res, rej) => texLoader.load(url, res, undefined, rej)));
  /** 共有テクスチャの設定違い（repeat 等）は clone で（画像データは共有される） */
  async function tex(url, { srgb = true, repeat, aniso = 8, wrap = true, flipY } = {}) {
    const base = await loadTex(url);
    const t = repeat || flipY === false ? base.clone() : base;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = Math.min(aniso, maxAniso);
    if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeat) t.repeat.set(repeat[0], repeat[1] ?? repeat[0]);
    if (flipY === false) t.flipY = false;
    t.needsUpdate = true;
    return t;
  }
  const exists = (url) => once('h:' + url, () => fetch(url, { method: 'HEAD' }).then((r) => r.ok).catch(() => false));
  /** PBR セット: { map, normalMap, roughnessMap, metalnessMap, aoMap } を返す（MeshStandardMaterial にそのまま spread 可） */
  async function pbr(dir, { repeat = [1, 1], aniso = 8, ext = 'jpg' } = {}) {
    const f = (n) => `${dir}/${n}.${ext}`;
    const [hasDiff, hasNor, hasArm, hasRough] = await Promise.all(['diff', 'nor', 'arm', 'rough'].map((n) => exists(f(n))));
    const out = {};
    if (hasDiff) out.map = await tex(f('diff'), { srgb: true, repeat, aniso });
    if (hasNor) out.normalMap = await tex(f('nor'), { srgb: false, repeat, aniso });
    if (hasArm) { const arm = await tex(f('arm'), { srgb: false, repeat, aniso }); out.aoMap = arm; out.roughnessMap = arm; out.metalnessMap = arm; }
    else if (hasRough) out.roughnessMap = await tex(f('rough'), { srgb: false, repeat, aniso });
    return out;
  }
  async function gltf(url) {
    const g = await once('g:' + url, () => gltfLoader.loadAsync(url));
    const scene = g.scene.clone(true);
    scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return { scene, animations: g.animations, source: g };
  }
  async function hdr(url) {
    return once('e:' + url, async () => {
      const t = await hdrLoader.loadAsync(url);
      t.mapping = THREE.EquirectangularReflectionMapping;
      pmrem ??= new THREE.PMREMGenerator(renderer);
      const env = pmrem.fromEquirectangular(t).texture; t.dispose();
      return env;
    });
  }
  function canvas(w, h, painter, { srgb = true, repeat, aniso = 8, mip = true } = {}) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    painter(c.getContext('2d'), w, h, c);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = Math.min(aniso, maxAniso);
    t.generateMipmaps = mip; t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1] ?? repeat[0]); }
    return t;
  }
  /** シーン（またはゾーンの group）の中から CubeCamera で環境マップを焼く（金・大理石に本物の映り込み） */
  function bakeEnv(scene, pos, { size = 256, near = 0.1, far = 400 } = {}) {
    const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const cam = new THREE.CubeCamera(near, far, rt); cam.position.copy(pos); scene.add(cam);
    cam.update(renderer, scene); scene.remove(cam);
    pmrem ??= new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromCubemap(rt.texture).texture; rt.dispose();
    return env;
  }
  return { tex, pbr, gltf, hdr, canvas, bakeEnv, exists, maxAniso, cache };
}
