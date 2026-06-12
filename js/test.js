// test.js — test runner, loads questions from JSON, persists result via Tracker

let QUESTIONS = [];
let currentIndex = 0;
let answers = [];
let questionsReady = false;

async function loadQuestions() {
  const res = await fetch('data/questions.json');
  if (!res.ok) throw new Error(`No se pudieron cargar las preguntas (${res.status})`);
  QUESTIONS = await res.json();
  answers = new Array(QUESTIONS.length).fill(null);
  questionsReady = true;
  const standardBtn = document.getElementById('standard-btn');
  if (standardBtn) {
    standardBtn.disabled = false;
    standardBtn.textContent = '📝 Test estándar (curado)';
  }
}

function startTest() {
  if (!questionsReady || !QUESTIONS.length) {
    alert('El test todavía está cargando. Intenta de nuevo en un momento.');
    return;
  }
  document.getElementById('intro').classList.add('hidden');
  document.getElementById('test').classList.remove('hidden');
  currentIndex = 0;
  renderQuestion();
}

function renderQuestion() {
  const q = QUESTIONS[currentIndex];
  const container = document.getElementById('question-container');
  const total = QUESTIONS.length;
  document.getElementById('progress-bar').style.width = `${((currentIndex + 1) / total) * 100}%`;

  if (q.type === 'reading-text') {
    container.innerHTML = `
      <div class="question-meta">
        <span class="level-badge">📖 LECTURA</span>
        <span>${currentIndex + 1} / ${total}</span>
      </div>
      <div class="question-text">Lee el siguiente texto. Vienen preguntas a continuación:</div>
      <div class="question-context">${q.text}</div>
    `;
    answers[currentIndex] = 'read';
    updateNavButtons();
    return;
  }

  if (q.type === 'listening') {
    container.innerHTML = `
      <div class="question-meta">
        <span class="level-badge">🎧 LISTENING · ${q.level}</span>
        <span>${currentIndex + 1} / ${total}</span>
      </div>
      <button class="listen-btn" id="play-btn">▶ Reproducir audio</button>
      <p style="color: var(--muted); font-size: 0.85rem; margin-bottom: 12px;">Puedes escuchar varias veces. NO leas el texto, solo escucha.</p>
      <details style="margin-bottom: 12px; color: var(--muted); font-size: 0.85rem;"><summary style="cursor:pointer">Ver texto (no recomendado durante el test)</summary><p style="margin-top:8px">${q.text}</p></details>
      <div class="question-text">${q.q}</div>
      <div class="options" id="opts"></div>
    `;
    document.getElementById('play-btn').addEventListener('click', () => speak(q.text));
    renderOptions(q);
    updateNavButtons();
    return;
  }

  if (q.type === 'self') {
    container.innerHTML = `
      <div class="question-meta">
        <span class="level-badge">💭 AUTOEVALUACIÓN</span>
        <span>${currentIndex + 1} / ${total}</span>
      </div>
      <div class="question-text">${q.q}</div>
      <div class="self-rate">
        ${q.options.map((opt, i) => `
          <button class="${answers[currentIndex] === i ? 'selected' : ''}" data-i="${i}">${opt}</button>
        `).join('')}
      </div>
    `;
    container.querySelectorAll('.self-rate button').forEach(btn => {
      btn.addEventListener('click', () => selectAnswer(parseInt(btn.dataset.i, 10)));
    });
    updateNavButtons();
    return;
  }

  const skillEmoji = { vocab: '📚', grammar: '🔤', reading: '📖', listening: '🎧' };
  container.innerHTML = `
    <div class="question-meta">
      <span class="level-badge">${skillEmoji[q.skill] || ''} ${q.skill.toUpperCase()} · ${q.level}</span>
      <span>${currentIndex + 1} / ${total}</span>
    </div>
    <div class="question-text">${q.q}</div>
    <div class="options" id="opts"></div>
  `;
  renderOptions(q);
  updateNavButtons();
}

function renderOptions(q) {
  const opts = document.getElementById('opts');
  opts.innerHTML = q.options.map((opt, i) => `
    <button class="option ${answers[currentIndex] === i ? 'selected' : ''}" data-i="${i}">${opt}</button>
  `).join('');
  opts.querySelectorAll('.option').forEach(btn => {
    btn.addEventListener('click', () => selectAnswer(parseInt(btn.dataset.i, 10)));
  });
}

function selectAnswer(i) {
  answers[currentIndex] = i;
  renderQuestion();
}

function updateNavButtons() {
  document.getElementById('prev-btn').disabled = currentIndex === 0;
  const isLast = currentIndex === QUESTIONS.length - 1;
  document.getElementById('next-btn').textContent = isLast ? 'Ver resultados 🎯' : 'Siguiente →';
}

function nextQuestion() {
  if (currentIndex < QUESTIONS.length - 1) {
    currentIndex++;
    renderQuestion();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    showResults();
  }
}

function prevQuestion() {
  if (currentIndex > 0) {
    currentIndex--;
    renderQuestion();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function speak(text) {
  if (!window.speechSynthesis) {
    alert('Tu navegador no soporta síntesis de voz. Usa Chrome o Safari.');
    return;
  }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.95;
  const voices = speechSynthesis.getVoices();
  const en = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Samantha') || v.name.includes('Alex') || v.name.includes('Google US English'))) || voices.find(v => v.lang.startsWith('en'));
  if (en) u.voice = en;
  speechSynthesis.speak(u);
}

function captureMissedVocab() {
  // Add missed vocab words to the user's vocab pool for spaced review
  let added = 0;
  QUESTIONS.forEach((q, i) => {
    if (q.skill !== 'vocab' || q.type === 'reading-text' || q.type === 'self') return;
    if (answers[i] === q.correct) return; // they got it right
    const correctWord = q.options[q.correct].toLowerCase().trim();
    // Skip multi-word options
    if (correctWord.split(/\s+/).length > 1) return;
    if (Tracker.addToVocabPool(correctWord, 'test', q.q)) added++;
  });
  return added;
}

function showResults() {
  document.getElementById('test').classList.add('hidden');
  document.getElementById('results').classList.remove('hidden');

  const r = calculateCEFR(QUESTIONS, answers);
  Tracker.recordTest(r);
  const vocabAdded = captureMissedVocab();
  if (vocabAdded > 0) console.log(`Added ${vocabAdded} missed words to vocab pool`);

  document.getElementById('cefr-level').textContent = r.cefr;
  document.getElementById('cefr-label').textContent = CEFR_INFO[r.cefr].label;
  document.getElementById('cefr-summary').textContent = CEFR_INFO[r.cefr].desc;

  const skillNames = { vocab: '📚 Vocabulario', grammar: '🔤 Gramática', reading: '📖 Lectura', listening: '🎧 Listening' };
  let skillsHtml = Object.entries(r.bySkill).map(([skill, data]) => {
    const pct = data.total ? Math.round((data.correct / data.total) * 100) : 0;
    return `
      <div class="skill-bar">
        <div class="skill-bar-header"><span>${skillNames[skill]}</span><span>${data.correct}/${data.total} (${pct}%)</span></div>
        <div class="skill-bar-bg"><div class="skill-bar-fill" style="width:${pct}%"></div></div>
      </div>
    `;
  }).join('');

  const speakLevels = ['Cero', 'Muy básico', 'Básico', 'Intermedio', 'Avanzado'];
  skillsHtml += `
    <div class="skill-bar">
      <div class="skill-bar-header"><span>🗣 Speaking (autoeval)</span><span>${speakLevels[Math.round(r.speakingAvg)] || 'Cero'}</span></div>
      <div class="skill-bar-bg"><div class="skill-bar-fill" style="width:${Math.round(r.speakingAvg * 25)}%; background: linear-gradient(90deg, #f59e0b, #fb923c);"></div></div>
    </div>
    <div class="skill-bar">
      <div class="skill-bar-header"><span>✍️ Writing (autoeval)</span><span>${speakLevels[Math.round(r.writingAvg)] || 'Cero'}</span></div>
      <div class="skill-bar-bg"><div class="skill-bar-fill" style="width:${Math.round(r.writingAvg * 25)}%; background: linear-gradient(90deg, #f59e0b, #fb923c);"></div></div>
    </div>
  `;
  document.getElementById('skill-bars').innerHTML = skillsHtml;

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-box"><div class="num">${r.correct}/${r.total}</div><div class="lab">Respuestas correctas</div></div>
    <div class="stat-box"><div class="num">${Math.round((r.correct/r.total)*100)}%</div><div class="lab">Precisión total</div></div>
    <div class="stat-box"><div class="num">${r.cefr}</div><div class="lab">Nivel CEFR</div></div>
  `;

  const steps = generateRoadmap(r);
  document.getElementById('roadmap').innerHTML = steps.map(s => `
    <div class="roadmap-step">
      <strong>${s.title}</strong><br>
      <span style="color: var(--muted); font-size: 0.95rem;">${s.body}</span>
    </div>
  `).join('');

  // Filtered resources for the new level
  loadResources().then(all => {
    const filtered = filterResourcesForLevel(all, r.cefr);
    document.getElementById('result-resources').innerHTML = renderResourcesByCategory(filtered);
  });

  // Review
  renderReview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderReview() {
  let html = '';
  QUESTIONS.forEach((q, i) => {
    if (q.type === 'reading-text' || q.type === 'self') return;
    const userAns = answers[i];
    const isCorrect = userAns === q.correct;
    const badge = isCorrect
      ? '<span class="feedback-badge correct">✓ Correcta</span>'
      : '<span class="feedback-badge incorrect">✗ Incorrecta</span>';
    html += `
      <div style="background: var(--bg-2); padding: 12px; border-radius: 8px; margin-bottom: 10px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span style="color:var(--muted); font-size:0.85rem;">${q.level || ''} · ${q.skill || ''}</span>
          ${badge}
        </div>
        <div style="margin-bottom:6px;">${q.q}</div>
        <div style="color:var(--muted); font-size:0.9rem;">
          ${userAns !== null && userAns !== 'read' ? `Tu respuesta: <em>${q.options[userAns]}</em><br>` : '<em>Sin respuesta</em><br>'}
          ${!isCorrect ? `Correcta: <strong style="color:var(--success)">${q.options[q.correct]}</strong>` : ''}
          ${q.note ? `<br><span style="color:var(--accent); font-size:0.85rem;">💡 ${q.note}</span>` : ''}
        </div>
      </div>
    `;
  });
  document.getElementById('review').innerHTML = html;
}

function toggleReview() {
  document.getElementById('review').classList.toggle('hidden');
}

function restart() {
  answers = new Array(QUESTIONS.length).fill(null);
  currentIndex = 0;
  document.getElementById('results').classList.add('hidden');
  document.getElementById('intro').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== Phase 3: Dynamic test (Claude) =====
async function startDynamicTest() {
  const btn = document.getElementById('dynamic-btn');
  const detected = Tracker.currentLevel() || 'A2';

  if (!ApiKeys.hasAnthropic()) {
    alert('Necesitas tu API key de Anthropic. Ve a Settings → Anthropic.');
    location.href = 'settings.html';
    return;
  }

  btn.disabled = true;
  btn.textContent = `⏳ Generando preguntas para nivel ${detected}…`;

  try {
    const generated = await generateQuestions(detected, 10);
    QUESTIONS = generated;
    answers = new Array(QUESTIONS.length).fill(null);
    document.getElementById('intro').classList.add('hidden');
    document.getElementById('test').classList.remove('hidden');
    currentIndex = 0;
    renderQuestion();
  } catch (e) {
    alert(`Error generando preguntas: ${e.message}`);
    btn.disabled = false;
    btn.textContent = '✨ Test dinámico (generado por Claude)';
  }
}

// Init
loadQuestions()
  .then(() => {
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.onvoiceschanged = () => {};
      speechSynthesis.getVoices();
    }
  })
  .catch((e) => {
    const standardBtn = document.getElementById('standard-btn');
    if (standardBtn) {
      standardBtn.disabled = true;
      standardBtn.textContent = '❌ No se pudo cargar el test';
    }
    const intro = document.getElementById('intro');
    if (intro) {
      const p = document.createElement('p');
      p.style.color = 'var(--danger)';
      p.style.marginTop = '12px';
      p.textContent = `${e.message}. Si estás abriendo el archivo directo, usa un servidor local o GitHub Pages.`;
      intro.appendChild(p);
    }
  });
