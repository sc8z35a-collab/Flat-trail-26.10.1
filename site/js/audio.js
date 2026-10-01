// audio.js — Owner: F
// 外部音源なしの WebAudio 合成: ドローンパッド + 残響(合成IR) + 到着チャイム + 移動ウーッシュ
export function createAudio() {
  let ctx = null, master = null, verb = null, padGain = null, muted = false;
  const scale = [0, 3, 5, 7, 10, 12, 15, 17]; // マイナーペンタ系

  function impulse(sec = 3.2) {
    const len = ctx.sampleRate * sec, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  function start() {
    if (ctx) { ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    master.gain.linearRampToValueAtTime(0.8, ctx.currentTime + 3);
    verb = ctx.createConvolver(); verb.buffer = impulse();
    const verbGain = ctx.createGain(); verbGain.gain.value = 0.55; verb.connect(verbGain).connect(master);

    // パッド: デチューンしたノコギリ波×ローパス（LFOでうねり）
    padGain = ctx.createGain(); padGain.gain.value = 0.05;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 6;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06;
    const lfoG = ctx.createGain(); lfoG.gain.value = 280; lfo.connect(lfoG).connect(lp.frequency); lfo.start();
    [55, 82.41, 110, 164.81].forEach((f, i) => {
      [-7, 7].forEach(det => {
        const o = ctx.createOscillator(); o.type = i < 2 ? 'sawtooth' : 'triangle';
        o.frequency.value = f; o.detune.value = det; o.connect(lp); o.start();
      });
    });
    lp.connect(padGain); padGain.connect(master); padGain.connect(verb);
  }

  function chime(i = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    [0, 1, 2].forEach(k => {
      const note = scale[(i * 3 + k * 2) % scale.length];
      const f = 440 * Math.pow(2, (note - 9) / 12) * (k === 2 ? 2 : 1);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + k * 0.09);
      g.gain.linearRampToValueAtTime(0.09, t + k * 0.09 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + k * 0.09 + 2.4);
      o.connect(g); g.connect(master); g.connect(verb);
      o.start(t + k * 0.09); o.stop(t + k * 0.09 + 2.5);
    });
  }

  function whoosh(dur = 1.6) {
    if (!ctx || muted) return;
    const t = ctx.currentTime, len = ctx.sampleRate * dur;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(200, t); bp.frequency.exponentialRampToValueAtTime(1800, t + dur * 0.5); bp.frequency.exponentialRampToValueAtTime(300, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + dur * 0.45); g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(bp).connect(g); g.connect(master); g.connect(verb); src.start(t);
  }

  return {
    start, chime, whoosh,
    setIntensity(x) { if (padGain) padGain.gain.setTargetAtTime(0.04 + x * 0.04, ctx.currentTime, 0.5); },
    toggle() { muted = !muted; if (master) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.2); return !muted; },
    suspend() { ctx?.suspend(); }, resume() { ctx?.resume(); },
  };
}
