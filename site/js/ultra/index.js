// ultra/index.js — Owner: ABYSS
// ULTRA 拡張ハブ。main.js から installUltra(ctx) を1回呼ぶだけ。
//  - 平面反射（磨き石床）・実空間リフレクションプローブ・高精細影（PCF半径/4096）・異方性フィルタ全適用
//  - 他エージェントのプラグインを動的 import（存在しなければ黙って無視）:
//      site/js/ultra_w1..w4/index.js, site/js/exhibit_ultra.js(B), site/js/museum_ultra.js(C), site/js/fx_ultra.js(D)
//    各モジュールは export function install(ctx) -> { update?, onArrive?, onDepart?, setQuality?, dispose? } を返す
//  - URL: ?ultra=0 で全拡張オフ / ?only=reflect,probe,fx_ultra などで限定 / ?noplug で他人プラグイン無効
import * as THREE from 'three';
import { createFloorReflection } from './reflect.js';
import { createProbe } from './probe.js';

// プラグイン一覧は ultra/plugins.json（ABYSS 管理。追加依頼は CHAT か roles.py say で）。404 をコンソールに出さないため探索はしない。

export async function installUltra(ctx) {
  const qs = new URLSearchParams(location.search);
  const off = qs.get('ultra') === '0';
  const only = (qs.get('only') || '').split(',').filter(Boolean);
  const want = (name) => !off && (!only.length || only.includes(name));
  const { scene, renderer, camera, museum } = ctx;
  const parts = [];
  const log = (...a) => console.info('[ultra]', ...a);

  // ---- 1) 床の平面反射 ----
  let refl = null;
  if (want('reflect')) {
    try { refl = createFloorReflection({ scene, renderer, camera, museum }); parts.push({ name: 'reflect', ...refl }); } catch (e) { console.warn('[ultra] reflect failed', e); }
  }
  // ---- 2) 実空間プローブ ----
  let probe = null;
  if (want('probe')) {
    try { probe = createProbe({ scene, renderer, size: 256, base: scene.environment }); } catch (e) { console.warn('[ultra] probe failed', e); }
  }
  // ---- 3) 異方性フィルタを全テクスチャに（遅延生成テクスチャにも効くよう定期的に） ----
  const maxAniso = renderer.capabilities.getMaxAnisotropy?.() || 1;
  let anisoTarget = 1;
  const anisoAll = () => {
    if (anisoTarget <= 1) return;
    scene.traverse(o => {
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'bumpMap', 'clearcoatNormalMap']) {
        const t = m[k]; if (t && t.isTexture && t.anisotropy < anisoTarget) { t.anisotropy = anisoTarget; t.needsUpdate = true; }
      }
    });
  };
  // ---- 4) 影の高精細化 ----
  const shadowUp = (q) => {
    scene.traverse(o => {
      if (o.isLight && o.shadow && o.castShadow) {
        if (q === 'ultra') { o.shadow.radius = Math.max(o.shadow.radius || 1, 4); o.shadow.blurSamples = 16; }
      }
    });
  };

  // ---- 5) 他エージェントのプラグイン ----
  const plugins = [];
  if (!off && !qs.has('noplug')) {
    let list = [];
    try { list = (await (await fetch(new URL('./plugins.json', import.meta.url))).json()).plugins || []; } catch {}
    await Promise.all(list.map(async (p) => {
      const name = p.name || p.path;
      if (only.length && !only.includes(name)) return;
      if (!/^[a-z0-9_\/.-]+\.js$/i.test(p.path) || p.path.includes('..')) return; // パス注入防止
      let mod;
      try { mod = await import(new URL('../' + p.path, import.meta.url).href); }
      catch (e) { console.warn('[ultra] plugin load failed', p.path, e); return; }
      try {
        const inst = await mod.install?.({ ...ctx, THREE, ultra: true });
        if (inst) { plugins.push({ name, ...inst }); log('plugin', name); }
      } catch (e) { console.warn('[ultra] plugin install failed', p, e); }
    }));
  }

  let q = ctx.quality || 'high', t0 = 0, captured = false;
  const api = {
    reflection: refl, probe, plugins,
    setQuality(nq) {
      q = nq;
      const ultra = q === 'ultra';
      refl?.setQuality(q);
      probe?.setEnabled(ultra || q === 'high');
      anisoTarget = ultra ? maxAniso : q === 'high' ? Math.min(8, maxAniso) : 1;
      anisoAll(); shadowUp(q);
      for (const p of plugins) { try { p.setQuality?.(q); } catch (e) { console.warn(e); } }
    },
    resize() { refl?.resize(); },
    /** 到着時にプローブを撮り直す（停止中はカメラが動かないので映り込みが正しくなる） */
    onArrive(i, stop) {
      if (probe && (q === 'ultra' || q === 'high')) {
        const p = camera.position.clone(); p.y = Math.max(1.2, p.y);
        try { probe.capture(p); } catch (e) { console.warn('[ultra] probe capture', e); }
      }
      anisoAll();
      for (const pl of plugins) { try { pl.onArrive?.(i, stop, ctx); } catch (e) { console.warn(e); } }
    },
    onDepart(i) { for (const pl of plugins) { try { pl.onDepart?.(i, ctx); } catch (e) { console.warn(e); } } },
    update(t, dt) {
      probe?.update(dt);
      if (!captured && probe && t > 0.3 && (q === 'ultra' || q === 'high')) { captured = true; api.onArrive(-1, null); }
      if ((t0 += dt) > 4) { t0 = 0; anisoAll(); }
      for (const p of plugins) { try { p.update?.(t, dt, ctx); } catch (e) { console.warn(e); p.update = null; } }
    },
  };
  api.setQuality(q);
  return api;
}
