# モジュール間API契約
全モジュールは ES Module。`import * as THREE from 'three'`（importmapで `vendor/three/three.module.js`）。

```js
// data/news.js
export const NEWS = [{ id, year, date:'YYYY-MM', title, titleEn, org, category, summary, impact, source, color:'#hex' }]
export const WINGS = [{ id, name, years:[from,to], color }]

// museum.js
export function buildMuseum(scene, NEWS) -> { exhibits:[{ mesh, anchor:Vector3, viewPos:Vector3, news }], path:CatmullRomCurve3, update(t,dt) }

// exhibit.js
export function makeExhibit(news, index) -> THREE.Group  // ホログラム展示台＋キャンバステクスチャのパネル

// fx.js
export function createFX(scene, renderer) -> { update(t,dt,camera), burst(pos,color) }

// post.js
export function createPost(renderer, scene, camera, quality) -> { render(dt), resize(w,h), setFocus(v) }

// controls.js
export function createControls(camera, dom, museum) -> { update(dt), goTo(index), onArrive(cb), get index() }

// ui.js
export function createUI({ onStart, onNext, onPrev, onSelect }) -> { showNews(news), hideNews(), setProgress(p), toast(msg) }

// audio.js
export function createAudio() -> { start(), chime(i), setIntensity(x) }  // WebAudio合成のみ（外部音源不要）

// perf.js
export function createPerf(renderer) -> { quality:'high'|'mid'|'low', tick(dt), onChange(cb) }
```
