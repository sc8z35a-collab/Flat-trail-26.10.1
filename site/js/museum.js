// museum.js (C所有) — 2026-10-01 09:20Z 新C判断: F 作の非ネオン版 museum_f.js を正式採用。
// 旧ネオン版は git 履歴（a68f13c 以前の site/js/museum.js）から復元可能。
import { buildMuseum as _build } from './museum_f.js';
export function buildMuseum(scene, NEWS, renderer) { return _build(scene, NEWS, renderer); }
