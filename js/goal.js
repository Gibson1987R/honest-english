// goal.js — set CEFR target + timeline, compute realistic plan

// CEFR effort benchmarks (approx, conservative — based on Cambridge guidance)
const HOURS_PER_LEVEL_GAP = {
  'A1->A2': 100,
  'A2->B1': 200,
  'B1->B2': 250,
  'B2->C1': 300,
  'C1->C2': 400
};

const CEFR_VOCAB_TARGET = {
  'A1': 1000, 'A2': 2000, 'B1': 3500, 'B2': 6000, 'C1': 9000, 'C2': 12000
};

const LEVELS_ORDER = ['Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function totalHoursNeeded(currentLevel, targetLevel) {
  if (currentLevel === 'Pre-A1') currentLevel = 'A1';
  const ci = LEVELS_ORDER.indexOf(currentLevel);
  const ti = LEVELS_ORDER.indexOf(targetLevel);
  if (ci === -1 || ti === -1 || ti <= ci) return 0;
  let total = 0;
  for (let i = ci; i < ti; i++) {
    const key = `${LEVELS_ORDER[i]}->${LEVELS_ORDER[i+1]}`;
    total += HOURS_PER_LEVEL_GAP[key] || 200;
  }
  return total;
}

function vocabGap(currentLevel, targetLevel) {
  if (currentLevel === 'Pre-A1') currentLevel = 'A1';
  const have = CEFR_VOCAB_TARGET[currentLevel] || 1000;
  const need = CEFR_VOCAB_TARGET[targetLevel] || 3500;
  return Math.max(0, need - have);
}

function weeksBetween(date1, date2) {
  const ms = Math.max(0, new Date(date2) - new Date(date1));
  return ms / (1000 * 60 * 60 * 24 * 7);
}

function computePlan(currentLevel, targetLevel, targetDate) {
  const totalHours = totalHoursNeeded(currentLevel, targetLevel);
  const totalVocab = vocabGap(currentLevel, targetLevel);
  const weeks = weeksBetween(new Date(), targetDate);
  const days = weeks * 7;
  const hoursPerWeek = weeks > 0 ? totalHours / weeks : Infinity;
  const vocabPerDay = days > 0 ? Math.ceil(totalVocab / days) : 0;

  let feasibility = 'ok';
  let feasibilityMsg = `Plan realista: ${hoursPerWeek.toFixed(1)}h/semana de práctica activa.`;
  if (hoursPerWeek > 25) {
    feasibility = 'unrealistic';
    feasibilityMsg = `⚠️ ${hoursPerWeek.toFixed(1)}h/semana es prácticamente imposible sin dejar tu trabajo. Extiende el plazo o baja la meta.`;
  } else if (hoursPerWeek > 15) {
    feasibility = 'aggressive';
    feasibilityMsg = `🔥 Plan ambicioso: ${hoursPerWeek.toFixed(1)}h/semana. Posible pero demanda disciplina diaria.`;
  } else if (hoursPerWeek < 3) {
    feasibility = 'slow';
    feasibilityMsg = `🐢 Solo ${hoursPerWeek.toFixed(1)}h/semana. Realista pero lento. Considera acortar el plazo.`;
  }

  // Suggested daily session breakdown (45 min default)
  const dailyMinutes = Math.min(120, Math.max(20, Math.round((hoursPerWeek / 7) * 60)));
  const session = {
    totalMinutes: dailyMinutes,
    speakingMinutes: Math.round(dailyMinutes * 0.4),
    writingMinutes: Math.round(dailyMinutes * 0.25),
    vocabMinutes: Math.round(dailyMinutes * 0.25),
    listeningMinutes: Math.round(dailyMinutes * 0.10)
  };

  return {
    totalHours,
    totalVocab,
    weeks: Math.round(weeks * 10) / 10,
    days: Math.round(days),
    hoursPerWeek: Math.round(hoursPerWeek * 10) / 10,
    vocabPerDay,
    feasibility,
    feasibilityMsg,
    session
  };
}

function defaultTargetDate() {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return d.toISOString().slice(0, 10);
}

function suggestNextLevel(currentLevel) {
  if (!currentLevel || currentLevel === 'Pre-A1') return 'A2';
  const idx = LEVELS_ORDER.indexOf(currentLevel);
  if (idx === -1 || idx === LEVELS_ORDER.length - 1) return 'C2';
  return LEVELS_ORDER[idx + 1];
}

// ===== UI language by level =====
function uiLangForLevel(cefr) {
  if (!cefr || cefr === 'Pre-A1' || cefr === 'A1' || cefr === 'A2') return 'es';
  if (cefr === 'B1' || cefr === 'B2') return 'bi';
  return 'en';
}

function applyUILang() {
  const lvl = Tracker.currentLevel();
  const lang = uiLangForLevel(lvl);
  document.body.classList.remove('lang-es', 'lang-bi', 'lang-en');
  document.body.classList.add(`lang-${lang}`);
}

// ===== UI =====
function renderGoalForm() {
  const current = Tracker.currentLevel() || 'A2';
  const existing = Tracker.getGoal();
  const targetLevel = existing?.targetLevel || suggestNextLevel(current);
  const targetDate = existing?.targetDate || defaultTargetDate();

  document.getElementById('current-level').textContent = current;
  document.getElementById('target-level-select').value = targetLevel;
  document.getElementById('target-date').value = targetDate;
  document.getElementById('target-date').min = new Date().toISOString().slice(0, 10);

  if (existing?.motivation) {
    document.getElementById('motivation').value = existing.motivation;
  }

  applyUILang();
  recomputePlan();
}

function recomputePlan() {
  const current = Tracker.currentLevel() || 'A2';
  const targetLevel = document.getElementById('target-level-select').value;
  const targetDate = document.getElementById('target-date').value;

  if (!targetDate) return;

  const plan = computePlan(current, targetLevel, targetDate);

  const feasibilityColor = {
    'ok': 'var(--success)',
    'aggressive': 'var(--warning)',
    'unrealistic': 'var(--danger)',
    'slow': 'var(--muted)'
  }[plan.feasibility];

  document.getElementById('plan-output').innerHTML = `
    <div style="padding: 16px; background: var(--bg-2); border-left: 4px solid ${feasibilityColor}; border-radius: 8px; margin-bottom: 16px;">
      <strong style="color: ${feasibilityColor}">${plan.feasibilityMsg}</strong>
    </div>

    <div class="summary-grid">
      <div class="stat-box"><div class="num">${plan.totalHours}</div><div class="lab">Horas totales necesarias</div></div>
      <div class="stat-box"><div class="num">${plan.weeks}</div><div class="lab">Semanas disponibles</div></div>
      <div class="stat-box"><div class="num">${plan.hoursPerWeek}</div><div class="lab">Horas/semana requeridas</div></div>
      <div class="stat-box"><div class="num">${plan.totalVocab}</div><div class="lab">Palabras a aprender</div></div>
      <div class="stat-box"><div class="num">${plan.vocabPerDay}</div><div class="lab">Palabras/día</div></div>
      <div class="stat-box"><div class="num">${plan.session.totalMinutes}</div><div class="lab">Min/día sugeridos</div></div>
    </div>

    <h3 style="margin-top: 20px;">📅 Cómo se distribuye una sesión diaria</h3>
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px;">
      <div class="stat-box" style="background: rgba(99, 102, 241, 0.15);">
        <div class="num" style="color: var(--primary)">🎤 ${plan.session.speakingMinutes}'</div>
        <div class="lab">Speaking</div>
      </div>
      <div class="stat-box" style="background: rgba(245, 158, 11, 0.15);">
        <div class="num" style="color: var(--warning)">✍️ ${plan.session.writingMinutes}'</div>
        <div class="lab">Writing</div>
      </div>
      <div class="stat-box" style="background: rgba(6, 182, 212, 0.15);">
        <div class="num" style="color: var(--accent)">📚 ${plan.session.vocabMinutes}'</div>
        <div class="lab">Vocab</div>
      </div>
      <div class="stat-box" style="background: rgba(16, 185, 129, 0.15);">
        <div class="num" style="color: var(--success)">🎧 ${plan.session.listeningMinutes}'</div>
        <div class="lab">Listening</div>
      </div>
    </div>
  `;
}

function saveGoal() {
  const targetLevel = document.getElementById('target-level-select').value;
  const targetDate = document.getElementById('target-date').value;
  const motivation = document.getElementById('motivation').value.trim();
  if (!targetDate) { alert('Elige una fecha objetivo.'); return; }
  Tracker.setGoal({ targetLevel, targetDate, motivation });
  document.getElementById('save-status').textContent = '✓ Meta guardada';
  setTimeout(() => document.getElementById('save-status').textContent = '', 3000);
}

function clearGoal() {
  if (!confirm('¿Borrar tu meta actual?')) return;
  Tracker.clearGoal();
  location.reload();
}

// ===== Today's plan (helper for dashboard) =====
function todaysPlan() {
  const goal = Tracker.getGoal();
  if (!goal) return null;
  const current = Tracker.currentLevel() || 'A2';
  return computePlan(current, goal.targetLevel, goal.targetDate);
}

document.addEventListener('DOMContentLoaded', () => {
  // Only initialize the form UI on goal.html (it has these elements)
  if (!document.getElementById('target-level-select')) return;
  renderGoalForm();
  document.getElementById('target-level-select').addEventListener('change', recomputePlan);
  document.getElementById('target-date').addEventListener('change', recomputePlan);
});
