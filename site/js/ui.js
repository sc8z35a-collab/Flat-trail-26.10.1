// ui.js — Owner: E
// HUD / タイトル画面 / 詳細カード / タイムライン / ミニマップ / トースト
const $ = (s) => document.querySelector(s);

export function createUI({ news, wings, onStart, onNext, onPrev, onSelect, onToggleSound, onInfo }) {
  const timeline = $('#timeline');
  // タイムライン ドット
  news.forEach((n, i) => {
    const b = document.createElement('button');
    b.className = 'tl-dot'; b.style.setProperty('--c', n.color); b.title = n.title;
    b.dataset.i = i; b.setAttribute('aria-label', `${n.date} ${n.title}`);
    b.addEventListener('click', (e) => { e.stopPropagation(); onSelect(i + 1); });
    timeline.appendChild(b);
  });
  const dots = [...timeline.querySelectorAll('.tl-dot')];

  $('#btn-next').addEventListener('click', (e) => { e.stopPropagation(); onNext(); });
  $('#btn-prev').addEventListener('click', (e) => { e.stopPropagation(); onPrev(); });
  $('#btn-sound').addEventListener('click', (e) => { e.stopPropagation(); const on = onToggleSound(); e.currentTarget.classList.toggle('off', !on); });
  $('#btn-info').addEventListener('click', (e) => { e.stopPropagation(); onInfo(); });
  $('#btn-start').addEventListener('click', () => onStart());

  const card = $('#card');
  const wingEl = $('#hud-wing');
  let typeTimer = 0;

  function typeText(el, text, speed = 16) {
    clearInterval(typeTimer); el.textContent = ''; let i = 0;
    typeTimer = setInterval(() => { el.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(typeTimer); }, speed);
  }

  return {
    setLoading(p, label) {
      $('#load-bar').style.transform = `scaleX(${p})`;
      $('#load-pct').textContent = String(Math.round(p * 100)).padStart(3, '0');
      if (label) $('#load-label').textContent = label;
    },
    ready() { document.body.classList.add('is-ready'); },
    started() { document.body.classList.add('is-started'); },
    showNews(n) {
      card.style.setProperty('--c', n.color);
      $('#card-no').textContent = n.no;
      $('#card-date').textContent = n.date;
      $('#card-cat').textContent = n.category;
      $('#card-org').textContent = n.org;
      $('#card-title').textContent = n.title;
      $('#card-en').textContent = n.titleEn;
      $('#card-impact').textContent = n.impact;
      $('#card-src').textContent = n.source;
      typeText($('#card-summary'), n.summary);
      card.classList.remove('show'); void card.offsetWidth; card.classList.add('show');
    },
    hideNews() { card.classList.remove('show'); clearInterval(typeTimer); },
    toggleCard() { card.classList.toggle('collapsed'); },
    setStop(stopIndex, total, wing) {
      dots.forEach((d, i) => { d.classList.toggle('active', i === stopIndex - 1); d.classList.toggle('past', i < stopIndex - 1); });
      $('#hud-count').textContent = `${String(Math.max(0, Math.min(stopIndex, news.length))).padStart(2, '0')} / ${news.length}`;
      $('#btn-prev').disabled = stopIndex <= 0; $('#btn-next').disabled = stopIndex >= total - 1;
      if (wing) {
        if (wingEl.dataset.id !== wing.id) {
          wingEl.dataset.id = wing.id;
          wingEl.style.setProperty('--c', wing.color);
          wingEl.innerHTML = `<b>${wing.name}</b><span>${wing.sub}</span>`;
          wingEl.classList.remove('flash'); void wingEl.offsetWidth; wingEl.classList.add('flash');
        }
      }
    },
    setProgress(p) { $('#progress').style.transform = `scaleX(${p})`; },
    showFinale(on) { document.body.classList.toggle('is-finale', on); },
    toast(msg) {
      const t = $('#toast'); t.textContent = msg; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    },
  };
}
