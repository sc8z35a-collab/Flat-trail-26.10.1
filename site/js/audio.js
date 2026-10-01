// audio.js — Owner: F
// 「石とトラバーチンの美術館」の音響。外部音源ゼロ・すべて WebAudio でリアルタイム合成。
//  - 室内トーン: 空調のごく低いブラウンノイズ＋遠くの低い唸り
//  - アンビエント: サイン/三角波のやわらかな和音（リディア系、12秒ごとに緩やかに転回）
//  - 残響: 生成した石造ホールのIR（初期反射＋周波数依存で減衰する拡散テール）
//  - 到着チャイム: FMベル＋ローズ風ピアノ（展示ごとに音程・パンを変える）
//  - 移動: 靴音（トラバーチンのヒール音）＋空気の流れ
//  - フィナーレ: 長く伸びる和音
// 既存API互換: start(), chime(i), whoosh(dur), setIntensity(x), toggle(), suspend(), resume()
// 追加API: steps(dur), tick(), finale(), setPan(x), get enabled

import { NEWS, WINGS } from './data/news.js';

const LS_KEY = 'flattrail.sound';
// 展示室ごとの音の性格（移調・明るさ・和声の暗さ）。室数が変わっても循環で対応
const ROOM_MOODS = [
  { shift: 0,  bright: 1.0,  dark: 0 },   // 晩夏: 明るい長調
  { shift: -2, bright: 0.85, dark: 0 },   // 地殻変動: 低く重く
  { shift: 3,  bright: 1.15, dark: 0 },   // 九月の号砲: 高揚
  { shift: -3, bright: 0.75, dark: 1 },   // 境界: 翳り（短調寄り）
  { shift: 2,  bright: 1.0,  dark: 0 },   // 収斂: 落ち着いた長調
  { shift: -5, bright: 0.65, dark: 1 },   // 臨界: 暗く静か
];
const roomOf = (i) => {
  const w = NEWS?.[i]?.wing; const k = WINGS?.findIndex?.(x => x.id === w);
  return k >= 0 ? k : 0;
};

export function createAudio() {
  let ctx = null, master = null, comp = null, verbIn = null, dry = null;
  let padBus = null, roomBus = null, padVoices = [], chordTimer = 0, chordIdx = 0;
  let muted = (() => { try { return localStorage.getItem(LS_KEY) === 'off'; } catch { return false; } })();
  let intensity = 0, pan = 0;
  const MASTER_VOL = 0.85;

  // 和声進行（半音, 基音 D2=73.42Hz 基準）: Dmaj9 → Bm11 → Gmaj7#11 → Aadd9 → Em9 → Gmaj9
  const ROOT = 73.42;
  let mood = ROOM_MOODS[0], room = -1, padLP = null;
  const DARK = [ // 短調寄りの進行（Bm9 → Gmaj7 → Em11 → F#m7）
    [-3, 7, 12, 14, 19, 26],
    [-7, 4, 11, 14, 19, 23],
    [-10, 7, 12, 14, 17, 24],
    [-8, 4, 9, 12, 16, 21],
  ];
  const CHORDS = [
    [0, 7, 14, 16, 21, 28],
    [-3, 7, 12, 14, 19, 26],
    [-7, 4, 11, 14, 18, 23],
    [-5, 4, 9, 14, 16, 21],
    [2, 9, 14, 17, 21, 26],
    [-7, 7, 11, 14, 18, 21],
  ];
  // チャイム用スケール (D メジャーペンタ + 9th)
  const BELL = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const hz = (semi, base = ROOT) => base * Math.pow(2, semi / 12);

  // ---------- 石造ホールのインパルス応答を合成 ----------
  function stoneIR(sec = 4.2) {
    const sr = ctx.sampleRate, len = Math.floor(sr * sec);
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      // 初期反射（壁・床・天井）: 疎なタップ
      const taps = [0.011, 0.019, 0.027, 0.034, 0.043, 0.057, 0.071, 0.089];
      taps.forEach((t, k) => {
        const i = Math.floor((t + (ch ? 0.0031 * k : 0)) * sr);
        if (i < len) d[i] += (ch ? -1 : 1) * (0.55 - k * 0.05) * (Math.random() * 0.4 + 0.8);
      });
      // 拡散テール: ノイズを1極ローパスで時間とともに暗くする（石は高域を吸う）
      let lp = 0;
      const pre = Math.floor(0.025 * sr);
      for (let i = pre; i < len; i++) {
        const x = (i - pre) / (len - pre);
        const env = Math.pow(1 - x, 3.2) * (1 - Math.exp(-(i - pre) / (0.012 * sr)));
        const a = 0.55 + 0.42 * x; // 後半ほど強いローパス
        lp = lp * a + (Math.random() * 2 - 1) * (1 - a);
        d[i] += lp * env * 1.6;
      }
    }
    return buf;
  }

  function noiseBuffer(sec, type = 'white') {
    const sr = ctx.sampleRate, len = Math.floor(sr * sec);
    const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'brown') { b = (b + 0.02 * w) / 1.02; d[i] = b * 3.5; } else d[i] = w;
    }
    return buf;
  }

  // ---------- 起動（ユーザー操作内で呼ぶこと） ----------
  function start() {
    if (ctx) { ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC({ latencyHint: 'playback' }); } catch { ctx = new AC(); }
    // iOS アンロック: 無音バッファを1回鳴らす
    try { const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0); } catch {}

    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.4;
    master = ctx.createGain(); master.gain.value = 0;
    master.connect(comp).connect(ctx.destination);
    if (!muted) master.gain.setTargetAtTime(MASTER_VOL, ctx.currentTime + 0.1, 1.2);

    // 残響バス（プリディレイ＋コンボルバ＋高域カット）
    verbIn = ctx.createGain(); verbIn.gain.value = 1;
    const preDelay = ctx.createDelay(0.2); preDelay.delayTime.value = 0.028;
    const conv = ctx.createConvolver(); conv.buffer = stoneIR();
    const verbTone = ctx.createBiquadFilter(); verbTone.type = 'lowpass'; verbTone.frequency.value = 5200;
    const verbOut = ctx.createGain(); verbOut.gain.value = 0.62;
    verbIn.connect(preDelay).connect(conv).connect(verbTone).connect(verbOut).connect(master);
    dry = ctx.createGain(); dry.gain.value = 1; dry.connect(master);

    buildRoomTone();
    buildPad();
    ctx.addEventListener?.('statechange', () => { if (ctx.state === 'interrupted') ctx.resume?.(); });
  }

  // 空調ノイズ＋遠い低音（ほとんど聞こえないが「空間」を作る）
  function buildRoomTone() {
    roomBus = ctx.createGain(); roomBus.gain.value = 0.0; roomBus.connect(dry); roomBus.connect(verbIn);
    roomBus.gain.setTargetAtTime(0.05, ctx.currentTime + 0.5, 3);
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(6, 'brown'); src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 40;
    src.connect(hp).connect(lp).connect(roomBus); src.start();
    // ごく遅い揺らぎ
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.031;
    const lg = ctx.createGain(); lg.gain.value = 120; lfo.connect(lg).connect(lp.frequency); lfo.start();
    // 50Hz台の微かな唸り（建物の気配）
    const hum = ctx.createOscillator(); hum.type = 'sine'; hum.frequency.value = 49;
    const hg = ctx.createGain(); hg.gain.value = 0.06; hum.connect(hg).connect(roomBus); hum.start();
  }

  // 柔らかなパッド: 6声 × (サイン + 1オクターブ上の三角波をごく小さく)
  function buildPad() {
    padBus = ctx.createGain(); padBus.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 0.4;
    padLP = lp;
    padBus.connect(lp); lp.connect(dry); lp.connect(verbIn);
    const sweep = ctx.createOscillator(); sweep.frequency.value = 0.045;
    const sg = ctx.createGain(); sg.gain.value = 500; sweep.connect(sg).connect(lp.frequency); sweep.start();
    padBus.gain.setTargetAtTime(0.055, ctx.currentTime + 1, 4);

    for (let v = 0; v < 6; v++) {
      const g = ctx.createGain(); g.gain.value = 0;
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (p) { p.pan.value = (v / 5) * 1.2 - 0.6; g.connect(p).connect(padBus); } else g.connect(padBus);
      const o1 = ctx.createOscillator(); o1.type = 'sine';
      const o2 = ctx.createOscillator(); o2.type = 'triangle';
      const g2 = ctx.createGain(); g2.gain.value = 0.12;
      o1.detune.value = (Math.random() - 0.5) * 8; o2.detune.value = (Math.random() - 0.5) * 10;
      // ゆっくりした音量の呼吸（声部ごとに位相ずらし）
      const trem = ctx.createOscillator(); trem.frequency.value = 0.07 + v * 0.013;
      const tg = ctx.createGain(); tg.gain.value = 0.25; trem.connect(tg).connect(g.gain); trem.start();
      o1.connect(g); o2.connect(g2).connect(g); o1.start(); o2.start();
      padVoices.push({ o1, o2, g });
    }
    setChord(0, 0.01);
    chordTimer = setInterval(() => { chordIdx = (chordIdx + 1) % prog().length; setChord(chordIdx, 3.5); }, 12000);
  }

  const prog = () => (mood.dark ? DARK : CHORDS);
  function setChord(i, glide) {
    const t = ctx.currentTime, ch = prog()[i % prog().length];
    padVoices.forEach((v, k) => {
      const f = hz(ch[k] + mood.shift);
      v.o1.frequency.setTargetAtTime(f, t, glide / 3);
      v.o2.frequency.setTargetAtTime(f * 2, t, glide / 3);
      const lvl = (k === 0 ? 0.5 : 0.3) * (1 - k * 0.06);
      v.g.gain.setTargetAtTime(lvl, t, glide / 2);
    });
  }

  function panNode(x) {
    if (!ctx.createStereoPanner) return ctx.createGain();
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, x)); return p;
  }

  // FM ベル（金属的すぎない、真鍮の小さな鐘のような音）
  function bell(f, t, vol, out) {
    const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    car.type = 'sine'; mod.type = 'sine';
    car.frequency.value = f; mod.frequency.value = f * 3.5;
    mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 1.6);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4.2);
    mod.connect(mg).connect(car.frequency); car.connect(g).connect(out);
    car.start(t); mod.start(t); car.stop(t + 4.3); mod.stop(t + 4.3);
  }

  // ローズ風エレピ / ピアノ的な減衰音
  function piano(f, t, vol, out, len = 3.2) {
    const g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(f * 8, t); lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(vol * 0.35, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    [[1, 1], [2, 0.32], [3, 0.12], [4.01, 0.06]].forEach(([m, a]) => {
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine';
      o.frequency.value = f * m; o.detune.value = (Math.random() - 0.5) * 4; og.gain.value = a;
      o.connect(og).connect(lp); o.start(t); o.stop(t + len + 0.05);
    });
    lp.connect(g).connect(out);
  }

  function voiceOut(px = pan, wet = 0.8) {
    const p = panNode(px), w = ctx.createGain(); w.gain.value = wet;
    p.connect(dry); p.connect(w).connect(verbIn);
    return p;
  }

  // ---------- 公開API ----------
  // 展示室が変わったら和声・調・明るさを数秒かけて移ろわせる
  function setRoom(r) {
    if (!ctx || r === room) return;
    room = r; mood = ROOM_MOODS[r % ROOM_MOODS.length];
    chordIdx = 0; setChord(0, 6);
    if (padLP) padLP.frequency.setTargetAtTime(1400 * mood.bright, ctx.currentTime, 2);
  }

  function chime(i = 0) {
    if (!ctx || muted) return;
    if (i >= 99) return finale();
    setRoom(roomOf(i));
    const t = ctx.currentTime + 0.02;
    const out = voiceOut(pan, 0.9);
    const base = hz(24 + mood.shift); // D4 + 室ごとの移調
    const a = BELL[(i * 3) % BELL.length], b = BELL[(i * 3 + 2) % BELL.length], c = BELL[(i * 3 + 4) % BELL.length] + 12;
    piano(hz(a, base), t, 0.16, out);
    piano(hz(b, base), t + 0.11, 0.12, out);
    bell(hz(c, base), t + 0.24, 0.05, out);
    // 低音の支え（その時の和音のルート）
    piano(hz(prog()[chordIdx % prog().length][0] + 12 + mood.shift), t, 0.07, out, 4.5);
  }

  function finale() {
    if (!ctx || muted) return;
    const t = ctx.currentTime + 0.05, out = voiceOut(0, 1.1);
    [0, 7, 12, 16, 19, 23, 26, 31].forEach((s, k) => piano(hz(s + 12), t + k * 0.12, 0.09, out, 7));
    [36, 43].forEach((s, k) => bell(hz(s), t + 1.2 + k * 0.4, 0.035, out));
  }

  // トラバーチン床のヒール音（1歩）
  function step(t, vol, px) {
    const src = ctx.createBufferSource(); src.buffer = stepBuf || (stepBuf = noiseBuffer(0.12));
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800 + Math.random() * 700; bp.Q.value = 1.4;
    const body = ctx.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 260; body.gain.value = 9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    const p = voiceOut(px, 1.3);
    src.connect(bp).connect(body).connect(g).connect(p); src.start(t); src.stop(t + 0.12);
  }
  let stepBuf = null;

  function steps(dur = 1.6) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + 0.05, n = Math.max(2, Math.floor(dur / 0.52));
    for (let k = 0; k < n; k++) {
      const edge = Math.sin(Math.PI * (k + 0.5) / n); // 出だしと止まりは小さく
      step(t0 + k * 0.52 + Math.random() * 0.03, 0.05 + 0.07 * edge, k % 2 ? 0.12 : -0.12);
    }
  }

  // 移動時: 柔らかい空気の流れ + 靴音（SF的なウーッシュはしない）
  function whoosh(dur = 1.6) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(dur + 0.2);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.3;
    lp.frequency.setValueAtTime(180, t); lp.frequency.linearRampToValueAtTime(700, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(200, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.035, t + dur * 0.5); g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(lp).connect(g).connect(voiceOut(0, 0.6)); src.start(t);
    steps(dur);
  }

  // UIタップ: 木/石を軽く叩いたような短いクリック
  function tick() {
    if (!ctx || muted) return;
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(1500, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.05);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g).connect(voiceOut(0, 0.5)); o.start(t); o.stop(t + 0.08);
  }

  return {
    start, chime, whoosh, steps, tick, finale, setRoom,
    get enabled() { return !muted; },
    setPan(x) { pan = x; },
    setIntensity(x) {
      intensity = Math.max(0, Math.min(1, x));
      if (padBus) padBus.gain.setTargetAtTime(0.045 + intensity * 0.03, ctx.currentTime, 1.5);
    },
    toggle() {
      muted = !muted;
      try { localStorage.setItem(LS_KEY, muted ? 'off' : 'on'); } catch {}
      if (master) master.gain.setTargetAtTime(muted ? 0 : MASTER_VOL, ctx.currentTime, 0.25);
      return !muted;
    },
    suspend() { ctx?.suspend?.(); },
    resume() { ctx?.resume?.(); },
    dispose() { clearInterval(chordTimer); ctx?.close?.(); ctx = null; },
  };
}
