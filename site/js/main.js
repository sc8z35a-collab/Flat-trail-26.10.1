// main.js — Owner: A（統合）
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { NEWS, WINGS } from './data/news.js';
import { buildMuseum } from './museum.js';
import { createFX } from './fx.js';
import { createPost } from './post.js';
import { createControls } from './controls.js';
import { createUI } from './ui.js';
import { createAudio } from './audio.js';
import { createPerf } from './perf.js';

const canvas = document.getElementById('gl');
const wait = () => new Promise(r => requestAnimationFrame(() => r()));

function fatal(msg) {
  const l = document.getElementById('load-label'); if (l) l.textContent = msg;
  console.error(msg);
}

async function boot() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  } catch (e) { fatal('WEBGL NOT AVAILABLE'); return; }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setSize(innerWidth, innerHeight);

  const perf = createPerf(renderer); perf.apply();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020309);
  scene.fog = new THREE.FogExp2(0x03040b, 0.028);
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 160);

  const audio = createAudio();
  let controls, museum, fx, post, ui;

  ui = createUI({
    news: NEWS, wings: WINGS,
    onStart: start,
    onNext: () => controls?.next(), onPrev: () => controls?.prev(),
    onSelect: (i) => controls?.goTo(i),
    onToggleSound: () => audio.toggle(),
    onInfo: () => document.getElementById('about').classList.add('show'),
  });
  document.getElementById('about').addEventListener('click', (e) => e.currentTarget.classList.remove('show'));
  document.getElementById('card').addEventListener('click', () => ui.toggleCard());

  // ---- 段階ロード（進捗表示しつつメインスレッドを詰まらせない） ----
  ui.setLoading(0.05, 'ENVIRONMENT');
  await document.fonts?.ready?.catch?.(() => {});
  await wait();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture; scene.environmentIntensity = 0.35;
  pmrem.dispose();
  ui.setLoading(0.25, 'ARCHITECTURE'); await wait();

  museum = buildMuseum(scene, NEWS, renderer);
  ui.setLoading(0.6, 'PARTICLES'); await wait();
  const len = -museum.endZ + 20;
  fx = createFX(scene, renderer, { length: len, z0: 12 });
  ui.setLoading(0.75, 'POST-PROCESSING'); await wait();
  post = createPost(renderer, scene, camera, perf.quality);
  controls = createControls(camera, canvas, museum);

  const applyQ = (q) => {
    post.setQuality(q);
    fx.setDensity(q === 'high' ? 1 : q === 'mid' ? 0.6 : 0.35);
    fx.setPixelRatio(renderer.getPixelRatio());
    post.resize(innerWidth, innerHeight);
  };
  perf.onChange(applyQ); applyQ(perf.quality);

  // シェーダ事前コンパイル（初回カクつき防止）
  ui.setLoading(0.85, 'COMPILING SHADERS'); await wait();
  try { await renderer.compileAsync(scene, camera); } catch { renderer.compile(scene, camera); }
  post.render(0, 0.016);
  ui.setLoading(1, 'READY'); ui.ready();

  // ---- イベント連携 ----
  const wingOf = (stop) => {
    if (stop.kind === 'exhibit') return WINGS.find(w => w.id === NEWS[stop.index].wing);
    if (stop.kind === 'finale') return { id: 'end', name: 'THE TRAIL CONTINUES', sub: '終わりなき軌跡', color: '#ff4a5e' };
    return { id: 'intro', name: 'ENTRANCE', sub: '入館', color: '#38e8ff' };
  };
  const syncHud = (i) => {
    ui.setStop(i, museum.stops.length, wingOf(museum.stops[i]));
    ui.setProgress(i / (museum.stops.length - 1));
  };
  controls.onDepart((i) => {
    ui.hideNews(); ui.showFinale(false); syncHud(i);
    post.setWarp(1); audio.whoosh(1.4);
  });
  controls.onArrive((i) => {
    post.setWarp(0);
    const s = museum.stops[i];
    if (s.kind === 'exhibit') {
      const n = NEWS[s.index];
      ui.showNews(n); audio.chime(s.index); post.flash(0.12);
      fx.burst(museum.exhibits[s.index].mesh.userData.sculpt.getWorldPosition(new THREE.Vector3()), n.color);
      audio.setIntensity(s.index / NEWS.length);
    } else if (s.kind === 'finale') {
      ui.showFinale(true); post.flash(0.35); audio.chime(99);
    }
  });
  document.getElementById('btn-restart').addEventListener('click', (e) => { e.stopPropagation(); controls.goTo(0); });
  syncHud(0);

  // ---- 開始 ----
  let started = false;
  async function start() {
    if (started) return; started = true;
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch {}
    try { await screen.orientation?.lock?.('landscape'); } catch {}
    try { if (typeof DeviceOrientationEvent?.requestPermission === 'function') await DeviceOrientationEvent.requestPermission(); } catch {}
    audio.start(); ui.started(); post.flash(0.8);
    setTimeout(() => controls.goTo(1), 1600);
  }

  // ---- リサイズ ----
  const onResize = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); post.resize(w, h);
  };
  addEventListener('resize', onResize);
  screen.orientation?.addEventListener?.('change', () => setTimeout(onResize, 200));

  // ---- ループ ----
  let last = performance.now(), t = 0, running = true;
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) { last = performance.now(); audio.resume(); requestAnimationFrame(loop); } else audio.suspend();
  });
  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    controls.update(dt, t);
    const focus = museum.stops[controls.index].kind === 'exhibit' && !controls.moving ? museum.stops[controls.index].index : -1;
    museum.update(t, dt, focus);
    fx.update(t, dt);
    post.render(t, dt);
    perf.tick(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  window.__FT = { renderer, scene, camera, controls, museum, perf };
}

boot().catch(e => fatal('BOOT ERROR: ' + e.message));
