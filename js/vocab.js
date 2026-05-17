// vocab.js — smart vocab review (SM-2 lite) + list view

let VOCAB_BY_LEVEL = {};
let currentCard = null;
let currentCardData = null;
let viewMode = 'review'; // 'review' | 'list'

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
  document.getElementById('btn-mode-review').classList.toggle('active-mode', mode === 'review');
  document.getElementById('btn-mode-list').classList.toggle('active-mode', mode === 'list');
  document.getElementById('card-area').classList.toggle('hidden', mode !== 'review');
  document.getElementById('list-area').classList.toggle('hidden', mode !== 'list');
  if (mode === 'review') renderCard();
  else renderList();
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
  setMode('review');
}

init();
