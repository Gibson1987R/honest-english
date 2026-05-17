// vocab.js — smart vocab review (SM-2 lite) + list view

let VOCAB_BY_LEVEL = {};
let currentCard = null;
let currentCardData = null;
let viewMode = 'review'; // 'review' | 'list' | 'session'

// Session mode state: walk through N cards, rate at the end
let sessionQueue = [];
let sessionIndex = 0;
let sessionTarget = 10; // default cards per session

async function loadVocabData() {
  const res = await fetch('data/vocab-by-level.json');
  VOCAB_BY_LEVEL = await res.json();
}

function pickLevel() {
  const detected = Tracker.currentLevel();
  if (detected && VOCAB_BY_LEVEL[detected]) return detected;
  if (detected === 'Pre-A1') return 'A2';
  if (detected === 'C1' || detected === 'C2') return 'B2';
  return 'A2';
}

function vocabLookup(word) {
  for (const lvl of Object.keys(VOCAB_BY_LEVEL)) {
    const found = VOCAB_BY_LEVEL[lvl].find(v => v.word === word);
    if (found) return found;
  }
  return null;
}

function seedFromCurated(count = 10) {
  const lvl = pickLevel();
  const pool = VOCAB_BY_LEVEL[lvl] || [];
  let added = 0;
  for (const w of pool) {
    if (Tracker.addToVocabPool(w.word, 'curated', w.example)) {
      added++;
      if (added >= count) break;
    }
  }
  return added;
}

function pickNextCard() {
  const due = Tracker.dueVocabCards();
  if (due.length === 0) return null;
  return due[Math.floor(Math.random() * due.length)];
}

function setMode(mode) {
  viewMode = mode;
  document.getElementById('btn-mode-session').classList.toggle('active-mode', mode === 'session');
  document.getElementById('btn-mode-review').classList.toggle('active-mode', mode === 'review');
  document.getElementById('btn-mode-list').classList.toggle('active-mode', mode === 'list');
  document.getElementById('card-area').classList.toggle('hidden', mode === 'list');
  document.getElementById('list-area').classList.toggle('hidden', mode !== 'list');
  if (mode === 'session') startSession();
  else if (mode === 'review') renderCard();
  else renderList();
}

// ===== Session mode: walk first, rate at the end =====
function startSession() {
  const due = Tracker.dueVocabCards();
  // Determine session size: use goal-based vocab/day if set, else 10
  const goal = Tracker.getGoal();
  let target = 10;
  if (goal && typeof computePlan === 'function') {
    const plan = computePlan(Tracker.currentLevel() || 'A2', goal.targetLevel, goal.targetDate);
    if (plan.vocabPerDay > 0) target = Math.min(due.length || plan.vocabPerDay, plan.vocabPerDay);
  }
  sessionTarget = Math.max(1, target);
  sessionQueue = due.slice(0, sessionTarget).map(c => ({
    card: c,
    data: vocabLookup(c.word) || { word: c.word, translation: '—', definition: '', example: '' },
    seen: false,
    revealed: false,
    rating: null
  }));
  sessionIndex = 0;

  if (!sessionQueue.length) {
    document.getElementById('card-area').innerHTML = `
      <div style="text-align: center; padding: 40px 20px;">
        <div style="font-size: 3rem; margin-bottom: 16px;">✨</div>
        <h2>No hay palabras pendientes para esta sesión</h2>
        <p style="color: var(--muted); margin: 12px 0;">
          Agrega más palabras o usa el modo lista para revisar las que tienes.
        </p>
        <button class="btn" onclick="seedAndStart()">+ Agregar 10 palabras de mi nivel</button>
      </div>
    `;
    return;
  }
  renderSessionCard();
}

function renderSessionCard() {
  if (sessionIndex >= sessionQueue.length) {
    renderSessionRatings();
    return;
  }
  const item = sessionQueue[sessionIndex];
  item.seen = true;
  const total = sessionQueue.length;
  const pct = Math.round(((sessionIndex + 1) / total) * 100);

  document.getElementById('card-area').innerHTML = `
    <div style="text-align: center;">
      <div class="progress" style="margin-bottom: 20px;">
        <div class="progress-fill" style="width: ${pct}%"></div>
      </div>
      <div style="color: var(--muted); font-size: 0.85rem; margin-bottom: 8px;">
        Palabra ${sessionIndex + 1} de ${total} · ${sourceLabel(item.card.source)}
      </div>
      <div style="font-size: 3rem; font-weight: 700; margin: 16px 0; color: var(--accent);">
        ${item.data.word}
      </div>
      <div style="color: var(--muted); font-size: 1rem; margin-bottom: 12px;">
        🇪🇸 <strong>${item.data.translation}</strong>
      </div>
      <button class="btn btn-secondary btn-small" onclick="speakWord('${item.data.word}')">🔊 Escuchar</button>
      <div id="session-reveal-area" style="margin-top: 20px;">
        ${item.revealed ? renderRevealContent(item) : `<button class="btn btn-secondary btn-small" onclick="sessionReveal()">👁 Ver definición y ejemplo</button>`}
      </div>
      <div style="display: flex; gap: 8px; justify-content: center; margin-top: 24px;">
        <button class="btn btn-secondary" onclick="sessionPrev()" ${sessionIndex === 0 ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>⬅️ Anterior</button>
        <button class="btn btn-success" onclick="sessionNext()">
          ${sessionIndex === sessionQueue.length - 1 ? '✓ Terminar y calificar' : 'Siguiente ➡️'}
        </button>
      </div>
      <p style="color: var(--muted); font-size: 0.8rem; margin-top: 12px;">
        💡 Solo pasa de una a otra. Calificas todas al final.
      </p>
    </div>
  `;
}

function renderRevealContent(item) {
  return `
    <div style="background: var(--bg-2); padding: 16px; border-radius: 12px; text-align: left; margin-top: 8px;">
      <div style="color: var(--muted); font-size: 0.75rem; margin-bottom: 4px;">DEFINITION</div>
      <div style="margin-bottom: 10px;">${item.data.definition}</div>
      <div style="color: var(--muted); font-size: 0.75rem; margin-bottom: 4px;">EXAMPLE</div>
      <div style="font-style: italic; color: var(--muted);">"${item.data.example}"</div>
      ${item.card.context && item.card.source !== 'curated' ? `
        <div style="color: var(--muted); font-size: 0.75rem; margin-top: 10px;">CONTEXTO (fallaste aquí)</div>
        <div style="font-style: italic; color: var(--warning);">"${item.card.context}"</div>
      ` : ''}
    </div>
  `;
}

function sessionReveal() {
  sessionQueue[sessionIndex].revealed = true;
  document.getElementById('session-reveal-area').innerHTML = renderRevealContent(sessionQueue[sessionIndex]);
}

function sessionNext() {
  sessionIndex++;
  renderSessionCard();
}

function sessionPrev() {
  if (sessionIndex > 0) {
    sessionIndex--;
    renderSessionCard();
  }
}

function renderSessionRatings() {
  document.getElementById('card-area').innerHTML = `
    <h2 style="text-align: center; margin-bottom: 8px;">📝 Califica cada palabra</h2>
    <p style="text-align: center; color: var(--muted); font-size: 0.9rem; margin-bottom: 24px;">
      Honestamente — esto determina cuándo te vuelve a aparecer.
    </p>
    <div id="ratings-list" style="display: flex; flex-direction: column; gap: 10px;"></div>
    <div style="text-align: center; margin-top: 24px;">
      <button class="btn" onclick="submitSessionRatings()" id="submit-ratings-btn" disabled style="opacity:0.5;">
        ✓ Guardar evaluación
      </button>
      <p style="color: var(--muted); font-size: 0.8rem; margin-top: 8px;" id="ratings-progress">
        Califica las ${sessionQueue.length} palabras para guardar
      </p>
    </div>
  `;
  renderRatingsList();
}

function renderRatingsList() {
  const html = sessionQueue.map((item, idx) => `
    <div style="background: var(--bg-2); padding: 12px; border-radius: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
        <div>
          <strong style="color: var(--accent); font-size: 1.05rem;">${item.data.word}</strong>
          <span style="color: var(--muted); font-size: 0.85rem;">— ${item.data.translation}</span>
        </div>
        <button class="btn btn-secondary btn-small" style="padding: 2px 8px;" onclick="speakWord('${item.data.word}')">🔊</button>
      </div>
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px;">
        ${[1,2,3,4].map(r => {
          const labels = ['😖 Hard', '😕 Fail', '🙂 Good', '😎 Easy'];
          const colors = ['var(--danger)', 'var(--muted)', 'var(--success)', 'var(--accent)'];
          const isSelected = item.rating === r;
          return `<button onclick="rateSessionCard(${idx}, ${r})" style="padding: 6px; border: 2px solid ${isSelected ? colors[r-1] : 'var(--border)'}; background: ${isSelected ? colors[r-1] + '30' : 'var(--bg)'}; color: var(--text); border-radius: 6px; cursor: pointer; font-size: 0.8rem;">${labels[r-1]}</button>`;
        }).join('')}
      </div>
    </div>
  `).join('');
  document.getElementById('ratings-list').innerHTML = html;
  const ratedCount = sessionQueue.filter(i => i.rating !== null).length;
  const total = sessionQueue.length;
  document.getElementById('ratings-progress').textContent =
    ratedCount === total ? '✓ Listas todas. Puedes guardar.' : `${ratedCount} / ${total} calificadas`;
  const btn = document.getElementById('submit-ratings-btn');
  btn.disabled = ratedCount < total;
  btn.style.opacity = ratedCount < total ? '0.5' : '1';
}

function rateSessionCard(idx, rating) {
  sessionQueue[idx].rating = rating;
  renderRatingsList();
}

function submitSessionRatings() {
  sessionQueue.forEach(item => {
    if (item.rating !== null) {
      Tracker.reviewVocabCard(item.card.word, item.rating);
    }
  });
  alert(`✓ ${sessionQueue.length} palabras evaluadas. ¡Sesión completa!`);
  sessionQueue = [];
  sessionIndex = 0;
  updateStats();
  setMode('session'); // restart with new due cards
}

function renderList() {
  const all = Tracker.allVocabWords();
  if (!all.length) {
    document.getElementById('list-area').innerHTML = `
      <p style="text-align:center; color: var(--muted); padding: 20px;">
        No tienes palabras todavía. Haz el test o agrega palabras curadas para empezar.
      </p>
      <div style="text-align:center;">
        <button class="btn" onclick="seedAndStart()">+ Agregar 10 palabras de mi nivel</button>
      </div>
    `;
    return;
  }
  const rows = all.map(card => {
    const data = vocabLookup(card.word) || { word: card.word, translation: '—', definition: '', example: '' };
    const dueDate = new Date(card.due);
    const dueLabel = card.mastered
      ? '<span style="color: var(--success)">✓ Dominada</span>'
      : (dueDate <= new Date()
          ? '<span style="color: var(--warning)">⏰ Pendiente hoy</span>'
          : `<span style="color: var(--muted)">en ${Math.ceil((dueDate - new Date())/(1000*60*60*24))}d</span>`);
    const sourceLabel = {
      'curated': '📋', 'test': '❌', 'writing': '✍️'
    }[card.source] || '·';
    return `
      <tr style="border-bottom: 1px solid var(--border);">
        <td style="padding: 10px 8px; vertical-align: top;">
          <button class="btn btn-secondary btn-small" style="padding: 4px 10px;" onclick="speakWord('${data.word}')">🔊</button>
        </td>
        <td style="padding: 10px 8px;">
          <strong style="color: var(--accent); font-size: 1.05rem;">${data.word}</strong><br>
          <span style="color: var(--muted); font-size: 0.85rem;">${data.translation}</span>
        </td>
        <td style="padding: 10px 8px; color: var(--muted); font-size: 0.85rem;">
          ${data.definition}<br>
          <em>"${data.example}"</em>
        </td>
        <td style="padding: 10px 8px; font-size: 0.85rem;">
          <div>${sourceLabel} · ${card.reviews} repasos</div>
          <div>${dueLabel}</div>
        </td>
      </tr>
    `;
  }).join('');

  document.getElementById('list-area').innerHTML = `
    <div style="overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 2px solid var(--border); text-align: left; color: var(--muted); font-size: 0.8rem;">
            <th style="padding: 8px;"></th>
            <th style="padding: 8px;">WORD / TRADUCCIÓN</th>
            <th style="padding: 8px;">DEFINICIÓN Y EJEMPLO</th>
            <th style="padding: 8px;">ESTADO</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="text-align:center; margin-top: 20px;">
      <button class="btn btn-secondary btn-small" onclick="seedAndStart()">+ Agregar 5 palabras más</button>
    </div>
  `;
}

function renderCard() {
  currentCard = pickNextCard();

  if (!currentCard) {
    const stats = Tracker.vocabStats();
    document.getElementById('card-area').innerHTML = `
      <div style="text-align: center; padding: 40px 20px;">
        <div style="font-size: 3rem; margin-bottom: 16px;">✨</div>
        <h2>No hay tarjetas pendientes</h2>
        <p style="color: var(--muted); margin: 12px 0;">
          ${stats.total === 0
            ? 'Empieza agregando palabras a tu pool.'
            : `Ya repasaste todo lo que toca hoy. Tienes ${stats.total - stats.mastered} en curso, ${stats.mastered} dominadas.`}
        </p>
        ${stats.total === 0 ? `
          <button class="btn" onclick="seedAndStart()">+ Agregar 10 palabras de mi nivel</button>
        ` : `
          <button class="btn btn-secondary" onclick="seedAndStart()">+ Agregar 5 palabras más</button>
        `}
      </div>
    `;
    updateStats();
    return;
  }

  currentCardData = vocabLookup(currentCard.word) || {
    word: currentCard.word,
    translation: '—',
    definition: 'Definition not found — look it up.',
    example: currentCard.context || ''
  };

  document.getElementById('card-area').innerHTML = `
    <div style="text-align: center;">
      <div style="color: var(--muted); font-size: 0.75rem; margin-bottom: 8px;">
        ${sourceLabel(currentCard.source)} · Repaso #${currentCard.reviews + 1} · Próximo en ${currentCard.interval}d
      </div>
      <div style="font-size: 3rem; font-weight: 700; margin: 16px 0; color: var(--accent);">
        ${currentCardData.word}
      </div>
      <div style="color: var(--muted); font-size: 0.95rem; margin-bottom: 12px;">
        🇪🇸 <strong>${currentCardData.translation}</strong>
      </div>
      <button class="btn btn-secondary btn-small" onclick="speakWord('${currentCardData.word}')">🔊 Escuchar</button>
      <div id="reveal-area" style="margin-top: 24px;">
        <button class="btn" onclick="revealCard()">👁 Mostrar definición y ejemplo</button>
      </div>
    </div>
  `;
}

function sourceLabel(source) {
  return {
    'curated': '📋 Lista curada',
    'test': '❌ Fallaste en test',
    'writing': '✍️ Error en writing'
  }[source] || source;
}

function revealCard() {
  document.getElementById('reveal-area').innerHTML = `
    <div style="background: var(--bg-2); padding: 20px; border-radius: 12px; margin-bottom: 16px; text-align: left;">
      <div style="color: var(--muted); font-size: 0.8rem; margin-bottom: 4px;">DEFINITION</div>
      <div style="margin-bottom: 12px;">${currentCardData.definition}</div>
      <div style="color: var(--muted); font-size: 0.8rem; margin-bottom: 4px;">EXAMPLE</div>
      <div style="font-style: italic; color: var(--muted);">"${currentCardData.example}"</div>
      ${currentCard.context && currentCard.source !== 'curated' ? `
        <div style="color: var(--muted); font-size: 0.8rem; margin-top: 12px;">CONTEXTO (donde la fallaste)</div>
        <div style="font-style: italic; color: var(--warning);">"${currentCard.context}"</div>
      ` : ''}
    </div>
    <p style="color: var(--muted); font-size: 0.85rem; margin-bottom: 8px;">¿Qué tan bien la sabías?</p>
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
      <button class="btn btn-danger btn-small" onclick="rate(1)">😖 Hard</button>
      <button class="btn btn-secondary btn-small" onclick="rate(2)">😕 Fail</button>
      <button class="btn btn-success btn-small" onclick="rate(3)">🙂 Good</button>
      <button class="btn btn-success btn-small" onclick="rate(4)" style="background: var(--accent); color: #0f172a;">😎 Easy</button>
    </div>
  `;
}

function rate(score) {
  if (!currentCard) return;
  Tracker.reviewVocabCard(currentCard.word, score);
  renderCard();
  updateStats();
}

function speakWord(word) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(word);
  u.lang = 'en-US';
  u.rate = 0.85;
  speechSynthesis.speak(u);
}

function seedAndStart() {
  const added = seedFromCurated(10);
  if (added === 0) {
    alert('Ya tienes todas las palabras de tu nivel en el pool.');
    return;
  }
  alert(`✓ ${added} palabras agregadas a tu pool.`);
  if (viewMode === 'review') renderCard();
  else renderList();
  updateStats();
}

function updateStats() {
  const stats = Tracker.vocabStats();
  const recent = Tracker.recentlyReviewedWords(7).length;
  const goal = Tracker.getGoal();
  let vocabTarget = '';
  if (goal && typeof computePlan === 'function') {
    const plan = computePlan(Tracker.currentLevel() || 'A2', goal.targetLevel, goal.targetDate);
    vocabTarget = `<div class="stat-box"><div class="num">${plan.totalVocab}</div><div class="lab">Target total</div></div>`;
  }
  document.getElementById('stats').innerHTML = `
    <div class="stat-box"><div class="num">${stats.due}</div><div class="lab">Pendientes hoy</div></div>
    <div class="stat-box"><div class="num">${stats.total - stats.mastered}</div><div class="lab">En curso</div></div>
    <div class="stat-box"><div class="num">${stats.mastered}</div><div class="lab">Dominadas</div></div>
    <div class="stat-box"><div class="num">${recent}</div><div class="lab">Repasadas últ. 7d</div></div>
    ${vocabTarget}
  `;
}

async function init() {
  await loadVocabData();
  updateStats();
  setMode('session'); // start in session mode by default — preferred flow
}

init();
