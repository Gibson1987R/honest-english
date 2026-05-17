// speaking.js — the killer feature. Web Speech API OR Whisper (Phase 2).

let PROMPTS_BY_LEVEL = {};
let currentLevel = 'A2';
let currentPrompt = null;
let currentPromptIndex = 0;

// Web Speech API
let recognition = null;
let isRecording = false;

// MediaRecorder (Whisper mode)
let mediaRecorder = null;
let mediaStream = null;
let audioChunks = [];

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
  renderCurrentPrompt();
}

function loadSpecificPrompt(level, text, translation) {
  currentLevel = level;
  currentPrompt = { text, translation };
  renderCurrentPrompt();
  setSpeakMode('practice');
}

function renderCurrentPrompt() {
  // Render the prompt with each word tappable for individual TTS
  const words = currentPrompt.text.split(/(\s+)/);
  const html = words.map(w => {
    if (/^\s+$/.test(w)) return w;
    const clean = w.replace(/[.,!?;:"'’]/g, '');
    if (!clean) return w;
    const safe = clean.replace(/'/g, "\\'");
    return `<span class="prompt-word" onclick="speak('${safe}', 0.6)" title="Toca para escuchar esta palabra">${w}</span>`;
  }).join('');
  document.getElementById('prompt-text').innerHTML = html;
  document.getElementById('prompt-translation').textContent = currentPrompt.translation || '';
  document.getElementById('prompt-translation').classList.add('hidden');
  document.getElementById('show-translation-btn').textContent = '👁 Ver traducción';
  document.getElementById('result-area').classList.add('hidden');
  updateDailyGoalDisplay();
}

// ===== Mode switching =====
function setSpeakMode(mode) {
  document.getElementById('btn-mode-practice').classList.toggle('active-mode', mode === 'practice');
  document.getElementById('btn-mode-list').classList.toggle('active-mode', mode === 'list');
  document.getElementById('btn-mode-vocab').classList.toggle('active-mode', mode === 'vocab');
  document.getElementById('speak-practice-area').classList.toggle('hidden', mode !== 'practice');
  document.getElementById('speak-list-area').classList.toggle('hidden', mode === 'practice');
  if (mode === 'list') renderPromptList();
  if (mode === 'vocab') renderVocabList();
}

function renderPromptList() {
  let html = `<p style="color: var(--muted); font-size: 0.9rem; margin-bottom: 12px;">
    Todas las frases disponibles agrupadas por nivel. Toca 🔊 para escuchar, ▶ para practicarla.
  </p>`;
  Object.keys(PROMPTS_BY_LEVEL).forEach(lvl => {
    const pool = PROMPTS_BY_LEVEL[lvl] || [];
    html += `<h3 style="color: var(--accent); margin-top: 20px;">${lvl} <span style="color: var(--muted); font-size: 0.8rem; font-weight: normal;">(${pool.length} frases)</span></h3>`;
    html += `<div style="display: flex; flex-direction: column; gap: 6px;">`;
    pool.forEach(p => {
      const safeText = p.text.replace(/'/g, "\\'");
      const safeTrans = (p.translation || '').replace(/'/g, "\\'");
      html += `
        <div style="display: flex; gap: 8px; align-items: center; padding: 10px; background: var(--bg-2); border-radius: 6px;">
          <button class="btn btn-secondary btn-small" style="padding: 4px 8px; flex-shrink: 0;" onclick="speak('${safeText}')">🔊</button>
          <button class="btn btn-small" style="padding: 4px 8px; flex-shrink: 0;" onclick="loadSpecificPrompt('${lvl}', '${safeText}', '${safeTrans}')">▶</button>
          <div style="flex: 1; min-width: 0;">
            <div>${p.text}</div>
            <div style="color: var(--muted); font-size: 0.8rem; font-style: italic;">${p.translation || ''}</div>
          </div>
        </div>
      `;
    });
    html += `</div>`;
  });
  document.getElementById('speak-list-area').innerHTML = html;
}

function renderVocabList() {
  if (typeof Tracker === 'undefined') return;
  const recent = Tracker.recentlyReviewedWords(7);
  if (!recent.length) {
    document.getElementById('speak-list-area').innerHTML = `
      <div style="text-align: center; padding: 30px;">
        <p style="color: var(--muted); margin-bottom: 16px;">
          No has repasado palabras en los últimos 7 días. Ve a Vocab primero, repasa algunas, y vuelve aquí para practicar pronunciación.
        </p>
        <a href="vocab.html" class="btn">📚 Ir a Vocab</a>
      </div>
    `;
    return;
  }
  let html = `<p style="color: var(--muted); font-size: 0.9rem; margin-bottom: 12px;">
    🔁 <strong>${recent.length}</strong> palabras que repasaste recientemente. Practica su pronunciación: toca 🔊 para escuchar, ▶ para grabarte diciéndola.
  </p>`;
  html += `<div style="display: flex; flex-direction: column; gap: 6px;">`;
  recent.forEach(card => {
    const word = card.word;
    html += `
      <div style="display: flex; gap: 8px; align-items: center; padding: 10px; background: var(--bg-2); border-radius: 6px;">
        <button class="btn btn-secondary btn-small" style="padding: 4px 8px; flex-shrink: 0;" onclick="speak('${word}')">🔊</button>
        <button class="btn btn-small" style="padding: 4px 8px; flex-shrink: 0;" onclick="loadSpecificPrompt('vocab', '${word}', '')">▶ Practicar</button>
        <div style="flex: 1; font-size: 1.1rem; font-weight: 500; color: var(--accent);">${word}</div>
        <div style="color: var(--muted); font-size: 0.85rem;">${card.reviews} repasos · int ${card.interval}d</div>
      </div>
    `;
  });
  html += `</div>`;
  document.getElementById('speak-list-area').innerHTML = html;
}

function toggleTranslation() {
  const t = document.getElementById('prompt-translation');
  const btn = document.getElementById('show-translation-btn');
  t.classList.toggle('hidden');
  btn.textContent = t.classList.contains('hidden') ? '👁 Ver traducción' : '🙈 Ocultar traducción';
}

function speak(text, rate = 0.9) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = rate;
  const voices = speechSynthesis.getVoices();
  const en = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Samantha') || v.name.includes('Alex') || v.name.includes('Google US English'))) || voices.find(v => v.lang.startsWith('en'));
  if (en) u.voice = en;
  speechSynthesis.speak(u);
}

function speakPrompt() {
  if (!currentPrompt) return;
  speak(currentPrompt.text, 0.9);
}

function speakSlow() {
  if (!currentPrompt) return;
  speak(currentPrompt.text, 0.6);
}

// ===== Web Speech API mode =====
function initRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return false;
  recognition = new SR();
  recognition.lang = 'en-US';
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const confidence = event.results[0][0].confidence;
    scoreAttempt(transcript, confidence, 'webspeech');
  };
  recognition.onerror = (event) => {
    stopRecordingUI();
    if (event.error === 'no-speech') alert('No se escuchó nada. Intenta de nuevo.');
    else if (event.error === 'not-allowed') alert('Tienes que permitir acceso al micrófono.');
    else alert(`Error: ${event.error}`);
  };
  recognition.onend = () => stopRecordingUI();
  return true;
}

// ===== Whisper mode =====
async function initMediaRecorder() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return true;
  } catch (e) {
    alert('Necesito permiso de micrófono.');
    return false;
  }
}

function startWhisperRecording() {
  audioChunks = [];
  const options = MediaRecorder.isTypeSupported('audio/webm') ? { mimeType: 'audio/webm' } : {};
  mediaRecorder = new MediaRecorder(mediaStream, options);
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };
  mediaRecorder.onstop = async () => {
    const blob = new Blob(audioChunks, { type: 'audio/webm' });
    document.getElementById('result-area').classList.remove('hidden');
    document.getElementById('result-area').innerHTML = `<p style="text-align:center; color:var(--muted);">⏳ Enviando a Whisper para transcripción precisa…</p>`;
    try {
      const transcript = await transcribeWithWhisper(blob);
      scoreAttempt(transcript, 1.0, 'whisper');
    } catch (e) {
      document.getElementById('result-area').innerHTML = `<p style="color: var(--danger);">❌ ${e.message}</p>`;
    }
  };
  mediaRecorder.start();
}

function stopWhisperRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
}

// ===== Unified record toggle =====
async function toggleRecording() {
  const useWhisper = isWhisperEnabled();

  if (isRecording) {
    if (useWhisper) stopWhisperRecording();
    else if (recognition) recognition.stop();
    stopRecordingUI();
    return;
  }

  if (useWhisper) {
    if (!mediaStream) {
      const ok = await initMediaRecorder();
      if (!ok) return;
    }
    startWhisperRecording();
  } else {
    if (!recognition) {
      alert('Tu navegador no soporta Web Speech Recognition. Activa Whisper en Settings.');
      return;
    }
    try {
      recognition.start();
    } catch (e) {
      console.error(e);
      return;
    }
  }
  startRecordingUI();
}

function startRecordingUI() {
  isRecording = true;
  const btn = document.getElementById('mic-btn');
  btn.classList.add('recording');
  btn.textContent = '⏹ Detener';
  document.getElementById('result-area').classList.add('hidden');
}

function stopRecordingUI() {
  isRecording = false;
  const btn = document.getElementById('mic-btn');
  btn.classList.remove('recording');
  btn.textContent = '🎤 Grabar';
}

function isWhisperEnabled() {
  return document.getElementById('whisper-toggle')?.checked && ApiKeys.hasOpenAI();
}

// ===== Scoring (shared between modes) =====
function normalize(text) {
  return text.toLowerCase().replace(/[.,!?;:"'’]/g, '').replace(/\s+/g, ' ').trim();
}

function scoreAttempt(transcript, confidence, mode) {
  const expectedWords = normalize(currentPrompt.text).split(' ');
  const spokenWords = normalize(transcript).split(' ');

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

  const spokenStatus = spokenWords.map(w => ({
    word: w,
    extra: !expectedWords.includes(w)
  }));

  const expectedHtml = expectedWords.map((w, i) => {
    if (matches[i]) {
      return `<span class="transcript-word ok">${w}</span>`;
    } else {
      // Missed word — make it tappable to hear pronunciation
      return `<button class="transcript-word missing" onclick="speak('${w.replace(/'/g, "\\'")}', 0.6)" style="border:none; cursor:pointer; font-size: inherit; font-family: inherit;" title="Click para escuchar la pronunciación correcta">🔊 ${w}</button>`;
    }
  }).join(' ');
  const spokenHtml = spokenStatus.map(s => {
    if (s.extra) {
      // Extra word the user said — also clickable so they can hear it
      return `<button class="transcript-word bad" onclick="speak('${s.word.replace(/'/g, "\\'")}', 0.6)" style="border:none; cursor:pointer; font-size: inherit; font-family: inherit;">🔊 ${s.word}</button>`;
    }
    return `<span class="transcript-word ok">${s.word}</span>`;
  }).join(' ');

  let scoreClass = 'low';
  let feedback = '';
  if (score >= 85) { scoreClass = 'high'; feedback = '🎉 ¡Excelente! Pasa a la siguiente.'; }
  else if (score >= 60) { scoreClass = 'mid'; feedback = '👍 Bien, pero hay palabras que se perdieron. Intenta más despacio.'; }
  else { scoreClass = 'low'; feedback = '🔁 Repite. Escucha primero la versión lenta, luego intenta de nuevo.'; }

  const modeLabel = mode === 'whisper' ? '🤖 Whisper (alta precisión)' : '🎙 Web Speech (nativo)';

  document.getElementById('result-area').classList.remove('hidden');
  document.getElementById('result-area').innerHTML = `
    <div style="text-align:center; color:var(--accent); font-size: 0.8rem; margin-bottom: 8px;">${modeLabel}</div>
    <div class="speak-score ${scoreClass}">${score}%</div>
    <p style="text-align:center; color: var(--muted); margin-bottom: 12px;">${feedback}</p>
    <div style="margin-bottom: 12px;">
      <div style="color: var(--muted); font-size: 0.85rem; margin-bottom: 4px;">Esperado:</div>
      <div>${expectedHtml}</div>
    </div>
    <div style="margin-bottom: 12px;">
      <div style="color: var(--muted); font-size: 0.85rem; margin-bottom: 4px;">Lo que dijiste${mode === 'webspeech' ? ` (confianza ${Math.round((confidence || 0) * 100)}%)` : ''}:</div>
      <div>${spokenHtml}</div>
    </div>
    <div style="display:flex; gap: 8px; margin-top: 16px; flex-wrap: wrap;">
      <button class="btn btn-secondary btn-small" onclick="toggleRecording()">🔁 Intentar otra vez</button>
      <button class="btn btn-success btn-small" onclick="loadRandomPrompt()">➡️ Siguiente frase</button>
    </div>
    <p style="margin-top: 12px; font-size: 0.8rem; color: var(--muted);">
      💡 <strong>Verde</strong>: bien · <strong>Amarillo 🔊</strong>: faltó (toca para oír) · <strong>Rojo 🔊</strong>: extra (toca para oír cómo lo dijiste).
    </p>
  `;

  Tracker.recordSpeakingSession({
    level: currentLevel,
    promptText: currentPrompt.text,
    score: score,
    transcript: transcript,
    mode: mode
  });
}

// ===== Init =====
function updateDailyGoalDisplay() {
  const el = document.getElementById('daily-goal-display');
  if (!el) return;
  const doneToday = Tracker.speakingSessionsToday();
  const goal = Tracker.getGoal();
  let target = 5; // default daily target if no goal set
  if (goal && typeof computePlan === 'function') {
    const plan = computePlan(Tracker.currentLevel() || 'A2', goal.targetLevel, goal.targetDate);
    // Estimate: ~30 sec per sentence attempt, divide speaking minutes
    target = Math.max(3, Math.round(plan.session.speakingMinutes * 2));
  }
  const pct = Math.min(100, Math.round((doneToday / target) * 100));
  const ok = doneToday >= target;
  el.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; font-size: 0.9rem;">
      <span><strong>Meta de hoy:</strong> ${doneToday}/${target} oraciones ${ok ? '✅' : ''}</span>
      <span style="color: var(--muted); font-size: 0.8rem;">Streak: ${Tracker.speakingStreak()} días</span>
    </div>
    <div class="progress" style="margin: 6px 0 0;">
      <div class="progress-fill" style="width: ${pct}%"></div>
    </div>
  `;
}

async function initSpeaking() {
  await loadPrompts();
  const hasWebSpeech = initRecognition();

  // Setup Whisper toggle visibility
  const toggle = document.getElementById('whisper-toggle');
  const whisperLabel = document.getElementById('whisper-toggle-label');
  if (ApiKeys.hasOpenAI()) {
    whisperLabel.classList.remove('hidden');
    toggle.checked = true; // default to Whisper if key available — more accurate
  } else {
    whisperLabel.classList.add('hidden');
    if (!hasWebSpeech) {
      document.getElementById('no-mic-warning').classList.remove('hidden');
      document.getElementById('mic-btn').disabled = true;
    }
  }

  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.onvoiceschanged = () => {};
    speechSynthesis.getVoices();
  }

  const select = document.getElementById('level-select');
  const detected = pickLevel();
  Object.keys(PROMPTS_BY_LEVEL).forEach(lvl => {
    const opt = document.createElement('option');
    opt.value = lvl;
    opt.textContent = `${lvl} ${lvl === detected ? '(tu nivel)' : ''}`;
    if (lvl === detected) opt.selected = true;
    select.appendChild(opt);
  });

  const streak = Tracker.speakingStreak();
  if (streak > 0) {
    const el = document.getElementById('nav-streak');
    if (el) el.textContent = `🔥 ${streak} día${streak > 1 ? 's' : ''}`;
  }

  loadRandomPrompt();
}

initSpeaking();
