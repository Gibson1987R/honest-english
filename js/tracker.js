// tracker.js — localStorage persistence, streaks, brutal-honesty stats
const STORAGE_KEY = 'honestEnglish';

const Tracker = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return this._emptyState();
      const data = JSON.parse(raw);
      return { ...this._emptyState(), ...data };
    } catch {
      return this._emptyState();
    }
  },

  save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  },

  _emptyState() {
    return {
      testHistory: [],
      speakingHistory: [],
      startDate: new Date().toISOString()
    };
  },

  recordTest(result) {
    const data = this.load();
    data.testHistory.push({
      date: new Date().toISOString(),
      cefr: result.cefr,
      correct: result.correct,
      total: result.total,
      bySkill: result.bySkill,
      speakingAvg: result.speakingAvg,
      writingAvg: result.writingAvg
    });
    this.save(data);
  },

  recordSpeakingSession(session) {
    const data = this.load();
    data.speakingHistory.push({
      date: new Date().toISOString(),
      level: session.level,
      promptText: session.promptText,
      score: session.score,
      transcript: session.transcript
    });
    this.save(data);
  },

  reset() {
    localStorage.removeItem(STORAGE_KEY);
  },

  // ===== Computed honest stats =====
  currentLevel() {
    const data = this.load();
    if (!data.testHistory.length) return null;
    return data.testHistory[data.testHistory.length - 1].cefr;
  },

  daysSince(isoDate) {
    if (!isoDate) return Infinity;
    const then = new Date(isoDate);
    const now = new Date();
    const ms = now - then;
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  },

  daysSinceLastTest() {
    const data = this.load();
    if (!data.testHistory.length) return Infinity;
    return this.daysSince(data.testHistory[data.testHistory.length - 1].date);
  },

  daysSinceLastSpeaking() {
    const data = this.load();
    if (!data.speakingHistory.length) return Infinity;
    return this.daysSince(data.speakingHistory[data.speakingHistory.length - 1].date);
  },

  // Speaking streak: consecutive days with at least one session (ending today or yesterday)
  speakingStreak() {
    const data = this.load();
    if (!data.speakingHistory.length) return 0;

    const days = new Set(
      data.speakingHistory.map(s => new Date(s.date).toISOString().slice(0, 10))
    );

    let streak = 0;
    let cursor = new Date();
    // Allow today not yet practiced — count from yesterday
    const todayStr = cursor.toISOString().slice(0, 10);
    if (!days.has(todayStr)) cursor.setDate(cursor.getDate() - 1);

    while (true) {
      const key = cursor.toISOString().slice(0, 10);
      if (days.has(key)) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  },

  totalSpeakingSessions() {
    return this.load().speakingHistory.length;
  },

  avgSpeakingScore(lastN = 10) {
    const data = this.load();
    const recent = data.speakingHistory.slice(-lastN);
    if (!recent.length) return null;
    return Math.round(recent.reduce((a, s) => a + s.score, 0) / recent.length);
  },

  // Brutal-honesty message — the differentiator
  honestMessage() {
    const lastSpeak = this.daysSinceLastSpeaking();
    const lastTest = this.daysSinceLastTest();
    const sessions = this.totalSpeakingSessions();

    if (sessions === 0 && lastTest === Infinity) {
      return { tone: 'neutral', text: 'Welcome. Take the test, then start speaking. Honest progress only.' };
    }
    if (sessions === 0) {
      return { tone: 'warning', text: 'Tomaste el test pero nunca has practicado speaking. Esa es la única forma de avanzar.' };
    }
    if (lastSpeak === Infinity || lastSpeak > 7) {
      return { tone: 'warning', text: `Llevas ${lastSpeak === Infinity ? 'demasiados' : lastSpeak} días sin hablar inglés. El músculo se atrofia rápido.` };
    }
    if (lastSpeak > 3) {
      return { tone: 'warning', text: `${lastSpeak} días sin práctica. Vuelve hoy o el streak se pierde.` };
    }
    if (lastSpeak === 0) {
      return { tone: 'ok', text: '¡Practicaste hoy! Mantén el ritmo mañana.' };
    }
    return { tone: 'ok', text: `Última práctica hace ${lastSpeak} día(s). Vas bien.` };
  }
};
