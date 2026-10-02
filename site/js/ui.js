// ui.js — Owner: E
// HUD / タイトル / 壁面キャプション / 50日タイムライン定規 / 展示室の章タイトル / フィナーレ / トースト
// 非ネオン: 紙・墨・真鍮。アクセント色は news.color / wing.color を受け取っても彩度を落として使う。
const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const MONTH_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 50日の窓（ユーザー要件: 2026-10-01 までの50日間）
const WIN_END = Date.UTC(2026, 9, 1);
const DAY = 864e5;

/** 'YYYY.MM.DD' / 'YYYY-MM-DD' / 'YYYY/MM/DD' / 'YYYY.MM' を UTC ms に。失敗時 null */
export function parseDate(s) {
  const m = String(s ?? '').match(/(\d{4})\D(\d{1,2})(?:\D(\d{1,2}))?/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, m[3] ? +m[3] : 15);
}
const fmtDate = (s) => {
  const t = parseDate(s); if (t == null) return esc(s);
  const d = new Date(t);
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
};

/** ネオン色を美術館向けに沈める: 彩度を落とし、明度を中庸に寄せ、真鍮へ少し寄せる */
export function muted(hex, fallback = '#a8834a') {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  let r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min; s = l > .5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6;
  }
  const S = Math.min(s, 0.42) * 0.8, L = Math.min(Math.max(l, 0.34), 0.5);
  const hue2 = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  const q = L < .5 ? L * (1 + S) : L + S - L * S, p = 2 * L - q;
  let R = hue2(p, q, h + 1 / 3), G = hue2(p, q, h), B = hue2(p, q, h - 1 / 3);
  // 真鍮(#a8834a)へ 25% 寄せる
  R = R * .75 + .659 * .25; G = G * .75 + .514 * .25; B = B * .75 + .29 * .25;
  const to = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return `#${to(R)}${to(G)}${to(B)}`;
}

export function createUI({ news = [], wings = [], onStart, onNext, onPrev, onSelect, onToggleSound, onInfo, onTap } = {}) {
  const hud = $('#hud');
  const N = news.length;

  // ---------- タイトル画面: 件数・期間に合わせて文言を自動更新（index.html の旧文言を上書き） ----------
  const tj = $('.tagline-jp');
  if (tj) tj.textContent = `2026年8月12日 — 10月1日　AIが動いた50日間、${N}の展示`;
  const tg = $('.tagline'); if (tg) tg.textContent = 'A MUSEUM OF FIFTY DAYS IN AI';
  const logo = $('.logo');
  if (logo && !logo.querySelector('.ch')) { // 1文字ずつ現れるロゴ
    const words = (logo.textContent || 'FLAT TRAIL').trim().split(/\s+/);
    let k = 0;
    logo.innerHTML = words.map(w => `<span>${[...w].map(c => `<span class="ch" style="--i:${k++}">${esc(c)}</span>`).join('')}</span>`).join(' ');
  }
  const inner = $('.intro-inner');
  if (inner && !$('.eyebrow')) inner.prepend(el('p', 'eyebrow', 'An exhibition in fifty days'));
  const intro = $('#intro');
  if (intro && !$('.intro-credit')) intro.appendChild(el('p', 'intro-credit', '2026 · 08 · 12 — 2026 · 10 · 01'));
  const startBtn = $('#btn-start'); if (startBtn) startBtn.textContent = '入館する';
  const hint = $('.hint'); if (hint) hint.innerHTML = 'タップで全画面・横向き表示　／　スワイプまたは右下のボタンで次の展示へ<br>ドラッグで見回し・ダブルタップで作品に近づく';
  const brand = $('.brand'); if (brand) brand.innerHTML = 'FLAT TRAIL<small>fifty days in AI</small>';
  const aboutBox = $('#about .box');
  if (aboutBox) aboutBox.innerHTML = `
    <h2>FLAT TRAIL</h2>
    <p>2026年8月12日から10月1日までの<b>50日間</b>に起きたAIの重大ニュース${N}件を、時系列に並ぶ展示室で巡る3D美術館です。</p>
    <p><b>操作</b>　右下の黒いボタン／左へスワイプ＝次の展示、白いボタン／右へスワイプ＝前の展示。ドラッグで見回し、ダブルタップで作品に近づく。下部の定規の点をタップすると、その日付の展示へ移動します。キャプションをタップすると折りたためます。</p>
    <p><b>キーボード</b>　<kbd>→</kbd><kbd>←</kbd> <kbd>Space</kbd>　ホイールでも移動できます。</p>
    <p><b>出典</b>　各キャプション右下の出典欄、およびリポジトリの research/ を参照。日付は報道・発表日（米国時間）を基準にしています。</p>
    <p><b>画像</b>　館内のすべての作品・テクスチャはリアルタイム生成で、外部画像は使用していません。</p>
    <p style="opacity:.6">Built by agents A–F · three.js · WebGL2 · WebAudio</p>`;

  // ---------- 章タイトル（展示室の切替時） ----------
  const roomTitle = el('div', '', '');
  roomTitle.id = 'room-title';
  hud.appendChild(roomTitle);

  // ---------- 50日タイムライン定規 ----------
  const timeline = $('#timeline');
  timeline.innerHTML = '';
  const ts = news.map(n => parseDate(n.date));
  // 定規は常に要件の50日窓（08-12〜10-01）に固定。範囲外のデータは端に寄せる（DOM爆発・ラベル重なり防止）
  const t0 = Date.UTC(2026, 7, 12), t1 = WIN_END;
  const outOfRange = ts.filter(v => v == null || v < t0 - DAY || v > t1 + DAY).length;
  if (outOfRange) console.warn(`[ui] ${outOfRange} news items are outside the 50-day window (2026-08-12..10-01)`);
  const pos = (t) => Math.max(0, Math.min(100, ((t - t0) / (t1 - t0)) * 100));
  timeline.appendChild(el('div', 'tl-ruler'));
  for (let t = t0; t <= t1; t += DAY) {
    const d = new Date(t);
    const tick = el('div', 'tl-tick' + (d.getUTCDay() === 1 ? ' wk' : ''));
    tick.style.left = pos(t) + '%'; timeline.appendChild(tick);
    if (d.getUTCDate() === 1 || t === t0) {
      const lb = el('div', 'tl-label m', `${MONTH_EN[d.getUTCMonth()]}${t === t0 ? ' ' + d.getUTCDate() : ''}`);
      lb.style.left = pos(t) + '%'; timeline.appendChild(lb);
    } else if ([10, 20].includes(d.getUTCDate())) {
      const lb = el('div', 'tl-label', d.getUTCDate()); lb.style.left = pos(t) + '%'; timeline.appendChild(lb);
    }
  }
  const fill = el('div', 'tl-fill'); fill.style.width = '0%'; timeline.appendChild(fill);
  const now = el('div', 'tl-now'); now.style.left = '0%'; timeline.appendChild(now);
  const tip = el('div', 'tl-tip'); timeline.appendChild(tip);
  // 同日の展示は少し持ち上げて重ならないようにする
  const sameDay = {};
  const dots = news.map((n, i) => {
    const b = el('button', 'tl-dot');
    const t = ts[i] ?? (t0 + (t1 - t0) * (i + 0.5) / Math.max(1, N));
    const key = Math.round(t / DAY); const k = sameDay[key] = (sameDay[key] ?? -1) + 1;
    b.style.left = pos(t) + '%'; b.style.setProperty('--lift', `${k * 9}px`);
    b.style.setProperty('--c', muted(n.color));
    b.dataset.i = i; b.setAttribute('aria-label', `${n.date} ${n.title}`);
    b.addEventListener('click', (e) => { e.stopPropagation(); try { onTap?.(); } catch {} onSelect?.(i + 1); });
    b.addEventListener('pointerenter', () => showTip(i));
    b.addEventListener('pointerleave', () => tip.classList.remove('show'));
    timeline.appendChild(b);
    return b;
  });
  let tipTimer = 0;
  function showTip(i) {
    const n = news[i]; if (!n) return;
    tip.textContent = `${fmtDate(n.date)}　${n.title}`;
    tip.style.left = dots[i].style.left;
    tip.classList.add('show'); clearTimeout(tipTimer); tipTimer = setTimeout(() => tip.classList.remove('show'), 2200);
  }

  // ---------- ボタン ----------
  const stop = (fn) => (e) => { e.stopPropagation(); try { onTap?.(); } catch {} fn?.(e); };
  $('#btn-next').addEventListener('click', stop(() => onNext?.()));
  $('#btn-prev').addEventListener('click', stop(() => onPrev?.()));
  $('#btn-sound').addEventListener('click', stop((e) => { const on = onToggleSound?.(); e.currentTarget.classList.toggle('off', on === false); }));
  $('#btn-info').addEventListener('click', stop(() => onInfo?.()));
  startBtn?.addEventListener('click', () => onStart?.());
  // UI 上のポインタ操作がキャンバスの見回しに伝播しないように
  ['pointerdown', 'touchstart'].forEach(ev => hud.addEventListener(ev, (e) => { if (e.target !== hud) e.stopPropagation(); }, { passive: true }));

  // ---------- キャプション ----------
  const card = $('#card');
  if (!card.querySelector('.card-hint')) card.appendChild(el('span', 'card-hint', 'tap'));
  const summaryEl = $('#card-summary');
  const srcEl = $('#card-src');

  function renderSummary(text) {
    // 1文字ずつ墨がにじむように現れる（タイプライターより静かな演出）
    const chars = [...String(text ?? '')];
    summaryEl.innerHTML = chars.map((c, i) => `<span class="ch" style="--i:${i}">${esc(c)}</span>`).join('');
  }
  function renderSource(src) {
    const s = String(src ?? '');
    if (/^https?:\/\//.test(s)) {
      let host = s; try { host = new URL(s).hostname.replace(/^www\./, ''); } catch {}
      srcEl.innerHTML = `<a href="${esc(s)}" target="_blank" rel="noopener noreferrer">${esc(host)}</a>`;
      srcEl.querySelector('a').addEventListener('click', (e) => e.stopPropagation());
    } else srcEl.textContent = s;
  }

  let currentWing = null, lastStop = 0;
  const api = {
    setLoading(p, label) {
      $('#load-bar').style.transform = `scaleX(${p})`;
      $('#load-pct').textContent = String(Math.round(p * 100)).padStart(3, '0');
      if (label) $('#load-label').textContent = label;
    },
    ready() { document.body.classList.add('is-ready'); },
    started() { document.body.classList.add('is-started'); $('#btn-next')?.classList.add('pulse'); },
    showNews(n) {
      const i = news.indexOf(n);
      const c = muted(n.color);
      card.style.setProperty('--c', c);
      $('#card-no').textContent = n.no ?? String(i + 1).padStart(2, '0');
      $('#card-date').textContent = fmtDate(n.date);
      $('#card-cat').textContent = String(n.category ?? '').toUpperCase();
      $('#card-org').textContent = n.org ?? '';
      $('#card-title').textContent = n.title ?? '';
      $('#card-en').textContent = n.titleEn ?? '';
      $('#card-impact').textContent = n.impact ?? '';
      renderSource(n.source);
      renderSummary(n.summary);
      card.classList.remove('show'); void card.offsetWidth; card.classList.add('show');
    },
    hideNews() { card.classList.remove('show'); },
    toggleCard() { card.classList.toggle('collapsed'); },
    setStop(stopIndex, total, wing) {
      const exIdx = stopIndex - 1; // stop 0 = 入口
      if (stopIndex > 0) $('#btn-next')?.classList.remove('pulse');
      dots.forEach((d, i) => { d.classList.toggle('active', i === exIdx); d.classList.toggle('past', i < exIdx); });
      const shown = Math.max(0, Math.min(stopIndex, N));
      $('#hud-count').innerHTML = `${String(shown).padStart(2, '0')}<i>/</i>${String(N).padStart(2, '0')}`;
      $('#btn-prev').disabled = stopIndex <= 0; $('#btn-next').disabled = stopIndex >= total - 1;
      // 定規の現在位置
      const t = exIdx >= 0 && exIdx < N ? ts[exIdx] : (stopIndex >= total - 1 ? t1 : t0);
      if (t != null) {
        now.style.left = pos(t) + '%'; fill.style.width = pos(t) + '%';
        const d = new Date(t); now.dataset.d = `${MONTH_EN[d.getUTCMonth()]} ${d.getUTCDate()}`;
      }
      if (exIdx >= 0 && exIdx < N) showTip(exIdx);
      if (wing) {
        const wi = wings.findIndex(w => w.id === wing.id);
        const c = muted(wing.color);
        const wingEl = $('#hud-wing');
        if (wingEl.dataset.id !== wing.id) {
          wingEl.dataset.id = wing.id;
          wingEl.style.setProperty('--c', c);
          const no = wi >= 0 ? `ROOM ${ROMAN[wi + 1] || wi + 1}` : (wing.id === 'end' ? 'EPILOGUE' : 'PROLOGUE');
          wingEl.innerHTML = `<span class="room-no">${no}</span><b>${esc(wing.name)}</b><span>${esc(wing.sub ?? '')}</span>`;
          wingEl.classList.remove('flash'); void wingEl.offsetWidth; wingEl.classList.add('flash');
          // 展示室に入った瞬間だけ大きな章タイトル（前進時のみ・入口/終幕は除く）
          if (wi >= 0 && stopIndex > lastStop && currentWing !== wing.id) {
            const range = wing.range ?? wing.sub ?? '';
            roomTitle.style.setProperty('--c', c);
            roomTitle.innerHTML = `<div class="rt-inner"><div class="rt-no">ROOM ${ROMAN[wi + 1] || wi + 1}</div><div class="rt-name">${esc(wing.name)}</div>${wing.sub ? `<div class="rt-sub">${esc(wing.sub)}</div>` : ''}${wing.range ? `<div class="rt-range">${esc(range)}</div>` : ''}</div>`;
            roomTitle.classList.remove('show'); void roomTitle.offsetWidth; roomTitle.classList.add('show');
          }
          currentWing = wing.id;
        }
      }
      lastStop = stopIndex;
    },
    setProgress(p) { $('#progress').style.transform = `scaleX(${Math.max(0, Math.min(1, p))})`; },
    showFinale(on) {
      document.body.classList.toggle('is-finale', on);
      if (on) { card.classList.remove('show'); roomTitle.classList.remove('show'); }
    },
    toast(msg) {
      const t = $('#toast'); t.textContent = msg; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    },
    setMoving(on) { document.body.classList.toggle('is-moving', !!on); },
  };

  // ---------- フィナーレの内容（ボタンは main.js が #btn-restart にバインド） ----------
  const fin = $('#finale .f-inner');
  if (fin && !fin.querySelector('.f-title')) {
    const orgs = new Set(news.map(n => String(n.org ?? '').split(/\s*[\/,]\s*/)[0]).filter(Boolean));
    const head = el('div', '', `
      <div class="f-eyebrow">Epilogue — October 1, 2026</div>
      <div class="f-title">軌跡は、まだ続く。</div>
      <p class="f-text">50日のあいだに、AIは「より賢く、より安く」なり、同時に「出さない」という決断も生まれました。<br>次の展示室は、これからの日々の中にあります。</p>
      <div class="f-stats"><span><b>50</b>DAYS</span><span><b>${N}</b>EXHIBITS</span><span><b>${orgs.size}</b>ACTORS</span></div>`);
    fin.prepend(head);
    const rb = $('#btn-restart'); if (rb) rb.textContent = 'はじめから巡る';
  }
  return api;
}
