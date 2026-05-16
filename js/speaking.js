// speaking.js — the killer feature. Web Speech API: TTS + Recognition + scoring.

let PROMPTS_BY_LEVEL = {};
let currentLevel = 'A2';
let currentPrompt = null;
let currentPromptIndex = 0;
let recognition = null;
let isRecording = false;

async function loadPrompts() {
  const res = await fetch('data/prompts.json');
  PROMPTS_BY_LEVEL = await res.json();
}

function pickLevel() {
  const detected = Tracker.currentLevel();
  if (detected && PROMPTS_BY_LEVEL[detected]) return detected;
  if (detected === 'Pre-A1') return 'A1';
  if (detected === 'C1' || detected === 'C2') return 'B2';
  return 'A2';
}

function loadRandomPrompt() {
  currentLevel = document.getElementById('level-select').value || pickLevel();
  const pool = PROMPTS_BY_LEVEL[currentLevel] || [];
  if (!pool.length) {
    document.getElementById('prompt-text').textContent = `No hay prompts para ${currentLevel}`;
    return;
  }
  currentPromptIndex = Math.floor(Math.random() * pool.length);
  currentPrompt = pool[currentPromptIndex];
  document.getElementById('prompt-text').textContent = currentPrompt.text;
  document.getElementById('prompt-translation').textContent = currentPrompt.translation;
  document.getElementById('prompt-translation').classList.add('hidden');
  document.getElementById('show-translation-btn').textContent = '👁 Ver traducción';
  document.getElementById('result-area').classList.add('hidden');
  document.getElementById('next-btn').classList.add('hidden');
}

function toggleTranslation() {
  const t = document.getElementById('prompt-translation');
  const btn = document.getElementById('show-translation-btn');
  t.classList.toggle('hidden');
  btn.textContent = t.classList.contains('hidden') ? '👁 Ver traducción' : '🙈 Ocultar traducción';
}

function speakPrompt() {
  if (!currentPrompt) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(currentPrompt.text);
  u.lang = 'en-US';
  u.rate = 0.9;
  const voices = speechSynthesis.getVoices();
  const en = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Samantha') || v.name.includes('Alex') || v.name.includes('Google US English'))) || voices.find(v => v.lang.startsWith('en'));
  if (en) u.voice = en;
  speechSynthesis.speak(u);
}

function speakSlow() {
  if (!currentPrompt) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(currentPrompt.text);
  u.lang = 'en-US';
  u.rate = 0.6;
  const voices = speechSynthesis.getVoices();
  const en = voices.find(v => v.lang.startsWith('en'));
  if (en) u.voice = en;
  speechSynthesis.speak(u);
}

function initRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    document.getElementById('mic-btn').disabled = true;
    document.getElementById('no-mic-warning').classList.remove('hidden');
    return false;
  }
  recognition = new SR();
  recognition.lang = 'en-US';
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const confidence = event.results[0][0].confidence;
    scoreAttempt(transcript, confidence);
  };
  recognition.onerror = (event) => {
    stopRecording();
    if (event.error === 'no-speech') {
      alert('No se escuchó nada. Intenta de nuevo y habla más fuerte.');
    } else if (event.error === 'not-allowed') {
      alert('Tienes que permitir acceso al micrófono.');
    } else {
      alert(`Error: ${event.error}`);
    }
  };
  recognition.onend = () => {
    stopRecording();
  };
  return true;
}

function toggleRecording() {
  if (!recognition) return;
  if (isRecording) {
    recognition.stop();
  } else {
    try {
      recognition.start();
      isRecording = true;
      const btn = document.getElementById('mic-btn');
      btn.classList.add('recording');
      btn.textContent = '⏹ Detener';
      document.getElementById('result-area').classList.add('hidden');
    } catch (e) {
      console.error(e);
    }
  }
}

function stopRecording() {
  isRecording = false;
  const btn = document.getElementById('mic-btn');
  btn.classList.remove('recording');
  btn.textContent = '🎤 Grabar';
}

// Normalize text: lowercase, remove punctuation
function normalize(text) {
  return text.toLowerCase().replace(/[.,!?;:"']/g, '').replace(/\s+/g, ' ').trim();
}

// Score: word-level comparison with sequence alignment
function scoreAttempt(transcript, confidence) {
  const expectedWords = normalize(currentPrompt.text).split(' ');
  const spokenWords = normalize(transcript).split(' ');

  // Simple sequence matching: walk through expected, find each in remaining spoken
  const matches = new Array(expectedWords.length).fill(false);
  let spokenCursor = 0;
  for (let i = 0; i < expectedWords.length; i++) {
    const target = expectedWords[i];
    for (let j = spokenCursor; j < spokenWords.length; j++) {
      if (spokenWords[j] === target) {
        matches[i] = true;
        spokenCursor = j + 1;
        break;
      }
    }
  }

  const matched = matches.filter(Boolean).length;
  const score = Math.round((matched / expectedWords.length) * 100);

  // Mark spoken words: which were "ok" (matched something) and which were extra
  const spokenStatus = spokenWords.map(w => ({
    word: w,
    extra: !expectedWords.includes(w)
  }));

  // Render
  const expectedHtml = expectedWords.map((w, i) =>
    `<span class="transcript-word ${matches[i] ? 'ok' : 'missing'}">${w}</span>`
  ).join(' ');

  const spokenHtml = spokenStatus.map(s =>
    `<span class="transcript-word ${s.extra ? 'bad' : 'ok'}">${s.word}</span>`
  ).join(' ');

  let scoreClass = 'low';
  let feedback = '';
  if (score >= 85) {
    scoreClass = 'high';
    feedback = '🎉 ¡Excelente! Pasa a la siguiente.';
  } else if (score >= 60) {
    scoreClass = 'mid';
    feedback = '👍 Bien, pero hay palabras que se perdieron. Intenta más despacio y claro.';
  } else {
    scoreClass = 'low';
    feedback = '🔁 Repite. Escucha primero la versión lenta, luego intenta de nuevo.';
  }

  document.getElementById('result-area').classList.remove('hidden');
  document.getElementById('result-area').innerHTML = `
    <div class="speak-score ${scoreClass}">${score}%</div>
    <p style="text-align:center; color: var(--muted); margin-bottom: 12px;">${feedback}</p>
    <div style="margin-bottom: 12px;">
      <div style="color: var(--muted); font-size: 0.85rem; margin-bottom: 4px;">Esperado:</div>
      <div>${expectedHtml}</div>
    </div>
    <div style="margin-bottom: 12px;">
      <div style="color: var(--muted); font-size: 0.85rem; margin-bottom: 4px;">Lo que dijiste (confianza ${Math.round((confidence || 0) * 100)}%):</div>
      <div>${spokenHtml}</div>
    </div>
    <div style="display:flex; gap: 8px; margin-top: 16px; flex-wrap: wrap;">
      <button class="btn btn-secondary btn-small" onclick="toggleRecording()">🔁 Intentar otra vez</button>
      <button class="btn btn-success btn-small" onclick="loadRandomPrompt()">➡️ Siguiente frase</button>
    </div>
    <p style="margin-top: 12px; font-size: 0.8rem; color: var(--muted);">
      💡 <strong>Verde</strong>: bien · <strong>Amarillo</strong>: faltó · <strong>Rojo tachado</strong>: dijiste algo que no estaba.
    </p>
  `;

  // Track the session
  Tracker.recordSpeakingSession({
    level: currentLevel,
    promptText: currentPrompt.text,
    score: score,
    transcript: transcript
  });
}

// Init
async function initSpeaking() {
  await loadPrompts();
  initRecognition();

  // Pre-warm voices
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.onvoiceschanged = () => {};
    speechSynthesis.getVoices();
  }

  // Populate level selector
  const select = document.getElementById('level-select');
  const detected = pickLevel();
  Object.keys(PROMPTS_BY_LEVEL).forEach(lvl => {
    const opt = document.createElement('option');
    opt.value = lvl;
    opt.textContent = `${lvl} ${lvl === detected ? '(tu nivel)' : ''}`;
    if (lvl === detected) opt.selected = true;
    select.appendChild(opt);
  });

  // Update streak in nav
  const streak = Tracker.speakingStreak();
  if (streak > 0) {
    const el = document.getElementById('nav-streak');
    if (el) el.textContent = `🔥 ${streak} día${streak > 1 ? 's' : ''}`;
  }

  loadRandomPrompt();
}

initSpeaking();
