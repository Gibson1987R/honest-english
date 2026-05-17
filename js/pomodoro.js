// pomodoro.js — floating Pomodoro widget. Self-contained: inject this script
// and the widget appears in the bottom-right corner. Records completed pomodoros.

(function () {
  const WORK_MINUTES = 25;
  const BREAK_MINUTES = 5;
  const STORAGE_PREFS = 'honestEnglish.pomodoroPrefs';

  let totalSeconds = WORK_MINUTES * 60;
  let remaining = WORK_MINUTES * 60;
  let isWork = true;
  let isRunning = false;
  let timerId = null;

  function loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_PREFS)) || { work: WORK_MINUTES, brk: BREAK_MINUTES };
    } catch { return { work: WORK_MINUTES, brk: BREAK_MINUTES }; }
  }
  let prefs = loadPrefs();

  function injectStyles() {
    if (document.getElementById('pomodoro-styles')) return;
    const style = document.createElement('style');
    style.id = 'pomodoro-styles';
    style.textContent = `
      .pomo-widget {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: rgba(15, 23, 42, 0.95);
        backdrop-filter: blur(10px);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 14px;
        z-index: 9999;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        min-width: 180px;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        color: var(--text);
        transition: transform 0.2s;
      }
      .pomo-widget.minimized {
        padding: 8px 14px;
        min-width: 0;
      }
      .pomo-widget.minimized .pomo-content { display: none; }
      .pomo-widget .pomo-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        font-size: 0.75rem;
      }
      .pomo-phase {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 4px;
        font-weight: 600;
        font-size: 0.7rem;
      }
      .pomo-phase.work { background: rgba(99,102,241,0.25); color: var(--primary); }
      .pomo-phase.break { background: rgba(16,185,129,0.25); color: var(--success); }
      .pomo-time {
        font-size: 1.8rem;
        font-weight: 700;
        text-align: center;
        font-variant-numeric: tabular-nums;
      }
      .pomo-time.work { color: var(--primary); }
      .pomo-time.break { color: var(--success); }
      .pomo-bar {
        background: var(--bg-2);
        height: 4px;
        border-radius: 2px;
        margin: 8px 0;
        overflow: hidden;
      }
      .pomo-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--primary), var(--accent));
        transition: width 1s linear;
      }
      .pomo-controls {
        display: flex;
        gap: 4px;
        justify-content: center;
      }
      .pomo-controls button {
        background: var(--bg-2);
        border: 1px solid var(--border);
        color: var(--text);
        border-radius: 6px;
        padding: 6px 10px;
        cursor: pointer;
        font-size: 0.8rem;
      }
      .pomo-controls button:hover { background: var(--border); }
      .pomo-controls button.primary { background: var(--primary); border-color: var(--primary); }
      .pomo-toggle {
        position: absolute;
        top: 4px;
        right: 8px;
        background: none;
        border: none;
        color: var(--muted);
        cursor: pointer;
        font-size: 1rem;
      }
      .pomo-week-count {
        font-size: 0.7rem;
        color: var(--muted);
        text-align: center;
        margin-top: 6px;
      }
    `;
    document.head.appendChild(style);
  }

  function injectWidget() {
    if (document.getElementById('pomo-widget')) return;
    const widget = document.createElement('div');
    widget.id = 'pomo-widget';
    widget.className = 'pomo-widget';
    widget.innerHTML = `
      <button class="pomo-toggle" onclick="window.pomoToggleMinimize()">⛶</button>
      <div class="pomo-header">
        <span>🍅 Pomodoro</span>
        <span class="pomo-phase work" id="pomo-phase">WORK</span>
      </div>
      <div class="pomo-content">
        <div class="pomo-time work" id="pomo-time">25:00</div>
        <div class="pomo-bar"><div class="pomo-bar-fill" id="pomo-bar" style="width:100%"></div></div>
        <div class="pomo-controls">
          <button class="primary" id="pomo-start" onclick="window.pomoToggleStart()">▶ Start</button>
          <button onclick="window.pomoReset()">⟲</button>
          <button onclick="window.pomoSkip()">⏭</button>
        </div>
        <div class="pomo-week-count" id="pomo-week-count"></div>
      </div>
    `;
    document.body.appendChild(widget);
    updateWeekCount();
  }

  function updateDisplay() {
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const el = document.getElementById('pomo-time');
    if (el) {
      el.textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
      el.className = `pomo-time ${isWork ? 'work' : 'break'}`;
    }
    const bar = document.getElementById('pomo-bar');
    if (bar) bar.style.width = `${(remaining / totalSeconds) * 100}%`;
    const phase = document.getElementById('pomo-phase');
    if (phase) {
      phase.textContent = isWork ? 'WORK' : 'BREAK';
      phase.className = `pomo-phase ${isWork ? 'work' : 'break'}`;
    }
  }

  function updateWeekCount() {
    if (typeof Tracker === 'undefined') return;
    const count = Tracker.pomodorosThisWeek();
    const el = document.getElementById('pomo-week-count');
    if (el) el.textContent = `🔥 ${count} pomodoro${count !== 1 ? 's' : ''} esta semana`;
  }

  function playSound(frequency = 600, duration = 200) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration/1000);
      osc.start(); osc.stop(ctx.currentTime + duration/1000);
    } catch {}
  }

  function tick() {
    remaining--;
    updateDisplay();
    if (remaining <= 0) {
      clearInterval(timerId);
      isRunning = false;
      if (isWork) {
        // Completed a work pomodoro → record it
        if (typeof Tracker !== 'undefined') {
          Tracker.recordPomodoro(prefs.work);
          updateWeekCount();
        }
        playSound(800, 400);
        notify('🍅 Pomodoro completo. Hora de tu break.');
        isWork = false;
        totalSeconds = prefs.brk * 60;
        remaining = totalSeconds;
      } else {
        playSound(500, 400);
        notify('☕ Break terminado. Listo para otro round.');
        isWork = true;
        totalSeconds = prefs.work * 60;
        remaining = totalSeconds;
      }
      updateDisplay();
      const btn = document.getElementById('pomo-start');
      if (btn) btn.textContent = '▶ Start';
    }
  }

  function notify(msg) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('honest-english', { body: msg, icon: '/favicon.ico' });
    }
  }

  window.pomoToggleStart = function () {
    const btn = document.getElementById('pomo-start');
    if (isRunning) {
      clearInterval(timerId);
      isRunning = false;
      btn.textContent = '▶ Resume';
    } else {
      isRunning = true;
      btn.textContent = '⏸ Pause';
      timerId = setInterval(tick, 1000);
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  };

  window.pomoReset = function () {
    clearInterval(timerId);
    isRunning = false;
    isWork = true;
    totalSeconds = prefs.work * 60;
    remaining = totalSeconds;
    updateDisplay();
    const btn = document.getElementById('pomo-start');
    if (btn) btn.textContent = '▶ Start';
  };

  window.pomoSkip = function () {
    clearInterval(timerId);
    isRunning = false;
    if (isWork && typeof Tracker !== 'undefined') {
      Tracker.recordPomodoro(prefs.work);
      updateWeekCount();
    }
    isWork = !isWork;
    totalSeconds = (isWork ? prefs.work : prefs.brk) * 60;
    remaining = totalSeconds;
    updateDisplay();
    const btn = document.getElementById('pomo-start');
    if (btn) btn.textContent = '▶ Start';
  };

  window.pomoToggleMinimize = function () {
    document.getElementById('pomo-widget').classList.toggle('minimized');
  };

  // Init
  function init() {
    injectStyles();
    injectWidget();
    updateDisplay();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
