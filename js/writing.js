// writing.js — Phase 4: writing practice + Claude feedback

let PROMPTS_BY_LEVEL_W = {};
let currentLevel = 'A2';
let currentPrompt = null;

async function loadWritingPrompts() {
  const res = await fetch('data/writing-prompts.json');
  PROMPTS_BY_LEVEL_W = await res.json();
}

function pickLevel() {
  const detected = Tracker.currentLevel();
  if (detected && PROMPTS_BY_LEVEL_W[detected]) return detected;
  if (detected === 'Pre-A1') return 'A1';
  if (detected === 'C1' || detected === 'C2') return 'B2';
  return 'A2';
}

function loadRandomPrompt() {
  currentLevel = document.getElementById('w-level-select').value || pickLevel();
  const pool = PROMPTS_BY_LEVEL_W[currentLevel] || [];
  if (!pool.length) return;
  const idx = Math.floor(Math.random() * pool.length);
  currentPrompt = pool[idx];
  document.getElementById('w-prompt-text').textContent = currentPrompt.prompt;
  document.getElementById('w-min-max').textContent = `${currentPrompt.minWords}-${currentPrompt.maxWords} palabras`;
  document.getElementById('w-textarea').value = '';
  updateWordCount();
  document.getElementById('w-feedback').classList.add('hidden');
}

function updateWordCount() {
  const text = document.getElementById('w-textarea').value;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const target = currentPrompt ? `/ ${currentPrompt.minWords}-${currentPrompt.maxWords}` : '';
  document.getElementById('w-word-count').textContent = `${words} ${target}`;
}

const WRITING_SYSTEM_PROMPT = `You are an honest, kind but rigorous CEFR-aligned English teacher.

You evaluate writing samples from intermediate Spanish-speaking learners. You point out real mistakes clearly. You celebrate genuine strengths but never inflate praise.

You ONLY respond with valid JSON. No prose, no markdown. The exact shape:
{
  "overallScore": 0-100,
  "cefrEstimate": "A1" | "A2" | "B1" | "B2" | "C1" | "C2",
  "summary": "1-2 sentence honest assessment in Spanish",
  "strengths": ["...", "..."],
  "corrections": [
    {
      "original": "exact phrase from student",
      "corrected": "the better version",
      "explanation": "why, in Spanish, one short sentence"
    }
  ],
  "nextStep": "concrete suggestion in Spanish of what to practice next, ONE thing"
}

If the student's text is too short or off-topic, say so honestly in summary and lower the score.`;

async function submitForFeedback() {
  const text = document.getElementById('w-textarea').value.trim();
  if (!text) { alert('Escribe algo primero.'); return; }
  if (!ApiKeys.hasAnthropic()) {
    alert('Necesitas tu API key de Anthropic. Ve a Settings.');
    location.href = 'settings.html';
    return;
  }

  const btn = document.getElementById('w-submit-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Claude está revisando...';

  const userPrompt = `Student CEFR level (self-reported / detected): ${currentLevel}

Writing prompt was: "${currentPrompt.prompt}"

Student wrote:
"""
${text}
"""

Evaluate honestly. Return ONLY the JSON.`;

  try {
    const responseText = await callClaude(
      [{ role: 'user', content: userPrompt }],
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: WRITING_SYSTEM_PROMPT
      }
    );
    const feedback = parseJSONFromClaude(responseText);
    renderFeedback(feedback, text);
    Tracker.recordWritingSession({
      level: currentLevel,
      promptText: currentPrompt.prompt,
      studentText: text,
      score: feedback.overallScore,
      feedback: feedback
    });
  } catch (e) {
    document.getElementById('w-feedback').classList.remove('hidden');
    document.getElementById('w-feedback').innerHTML = `<p style="color: var(--danger);">❌ ${e.message}</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Enviar para feedback';
  }
}

function renderFeedback(fb, originalText) {
  let scoreClass = 'low';
  if (fb.overallScore >= 80) scoreClass = 'high';
  else if (fb.overallScore >= 60) scoreClass = 'mid';

  const strengthsHtml = (fb.strengths || []).map(s => `<li>${s}</li>`).join('');
  const correctionsHtml = (fb.corrections || []).map(c => `
    <div class="roadmap-step">
      <div style="margin-bottom: 6px;"><strong style="color:var(--danger);">Original:</strong> "${c.original}"</div>
      <div style="margin-bottom: 6px;"><strong style="color:var(--success);">Mejor:</strong> "${c.corrected}"</div>
      <div style="color: var(--muted); font-size: 0.9rem;">💡 ${c.explanation}</div>
    </div>
  `).join('');

  document.getElementById('w-feedback').classList.remove('hidden');
  document.getElementById('w-feedback').innerHTML = `
    <div class="speak-score ${scoreClass}">${fb.overallScore}%</div>
    <p style="text-align:center; color: var(--accent); margin-bottom: 12px;">CEFR estimado: <strong>${fb.cefrEstimate}</strong></p>
    <p style="text-align:center; color: var(--muted); margin-bottom: 20px; font-style: italic;">"${fb.summary}"</p>

    <h3 style="color: var(--success);">✅ Fortalezas</h3>
    <ul style="margin-left: 20px; color: var(--muted); margin-bottom: 16px;">${strengthsHtml || '<li>Ninguna destacada esta vez. Sigue practicando.</li>'}</ul>

    <h3 style="color: var(--danger);">🔧 Correcciones</h3>
    ${correctionsHtml || '<p style="color: var(--muted);">No hubo errores graves. ¡Bien hecho!</p>'}

    <h3 style="color: var(--accent);">🎯 Tu próximo paso</h3>
    <p style="color: var(--text); padding: 12px; background: var(--bg-2); border-radius: 8px;">${fb.nextStep}</p>

    <div style="display:flex; gap: 8px; margin-top: 16px; flex-wrap: wrap;">
      <button class="btn btn-success btn-small" onclick="loadRandomPrompt()">➡️ Otro prompt</button>
      <button class="btn btn-secondary btn-small" onclick="document.getElementById('w-feedback').classList.add('hidden')">📝 Editar mi texto</button>
    </div>
  `;
  window.scrollTo({ top: document.getElementById('w-feedback').offsetTop, behavior: 'smooth' });
}

async function initWriting() {
  await loadWritingPrompts();
  const select = document.getElementById('w-level-select');
  const detected = pickLevel();
  Object.keys(PROMPTS_BY_LEVEL_W).forEach(lvl => {
    const opt = document.createElement('option');
    opt.value = lvl;
    opt.textContent = `${lvl} ${lvl === detected ? '(tu nivel)' : ''}`;
    if (lvl === detected) opt.selected = true;
    select.appendChild(opt);
  });

  document.getElementById('w-textarea').addEventListener('input', updateWordCount);

  loadRandomPrompt();
}

initWriting();
