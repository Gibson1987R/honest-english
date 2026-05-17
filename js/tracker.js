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
      writingHistory: [],
      pomodoroHistory: [],
      vocabPool: [],
      goal: null,
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
      transcript: session.transcript,
      mode: session.mode || 'webspeech'
    });
    this.save(data);
  },

  recordWritingSession(session) {
    const data = this.load();
    if (!data.writingHistory) data.writingHistory = [];
    data.writingHistory.push({
      date: new Date().toISOString(),
      level: session.level,
      promptText: session.promptText,
      studentText: session.studentText,
      score: session.score,
      feedback: session.feedback
    });
    this.save(data);
  },

  totalWritingSessions() {
    return (this.load().writingHistory || []).length;
  },

  daysSinceLastWriting() {
    const data = this.load();
    const hist = data.writingHistory || [];
    if (!hist.length) return Infinity;
    return this.daysSince(hist[hist.length - 1].date);
  },

  // ===== Goal =====
  setGoal(goal) {
    const data = this.load();
    data.goal = {
      targetLevel: goal.targetLevel,
      targetDate: goal.targetDate,
      motivation: goal.motivation || '',
      createdAt: data.goal?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.save(data);
  },

  getGoal() {
    return this.load().goal || null;
  },

  clearGoal() {
    const data = this.load();
    data.goal = null;
    this.save(data);
  },

  // ===== Pomodoros =====
  recordPomodoro(durationMinutes) {
    const data = this.load();
    if (!data.pomodoroHistory) data.pomodoroHistory = [];
    data.pomodoroHistory.push({
      date: new Date().toISOString(),
      duration: durationMinutes
    });
    this.save(data);
  },

  pomodorosThisWeek() {
    const data = this.load();
    const hist = data.pomodoroHistory || [];
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return hist.filter(p => new Date(p.date) >= weekAgo).length;
  },

  pomodorosToday() {
    const data = this.load();
    const hist = data.pomodoroHistory || [];
    const today = new Date().toISOString().slice(0, 10);
    return hist.filter(p => p.date.slice(0, 10) === today).length;
  },

  totalPomodoros() {
    return (this.load().pomodoroHistory || []).length;
  },

  // ===== Vocab pool (smart cards with SM-2) =====
  addToVocabPool(word, source, context) {
    const data = this.load();
    if (!data.vocabPool) data.vocabPool = [];
    const lower = word.toLowerCase().trim();
    const existing = data.vocabPool.find(v => v.word === lower);
    if (existing) return false;
    data.vocabPool.push({
      word: lower,
      source: source,
      context: context || '',
      addedAt: new Date().toISOString(),
      due: new Date().toISOString(),
      interval: 0,
      easeFactor: 2.5,
      reviews: 0,
      mastered: false
    });
    this.save(data);
    return true;
  },

  reviewVocabCard(word, rating) {
    const data = this.load();
    const card = (data.vocabPool || []).find(v => v.word === word);
    if (!card) return;
    card.reviews++;
    card.lastReviewedAt = new Date().toISOString();
    // SM-2 lite: rating 1=hard, 2=fail, 3=good, 4=easy
    if (rating <= 2) {
      card.interval = 1;
      card.easeFactor = Math.max(1.3, card.easeFactor - 0.2);
    } else {
      if (card.interval === 0) card.interval = 1;
      else if (card.interval === 1) card.interval = 3;
      else card.interval = Math.round(card.interval * card.easeFactor);
      if (rating === 4) card.easeFactor = Math.min(3.0, card.easeFactor + 0.15);
    }
    const next = new Date();
    next.setDate(next.getDate() + card.interval);
    card.due = next.toISOString();
    if (card.reviews >= 5 && card.interval >= 14) card.mastered = true;
    if (!data.vocabReviewsLog) data.vocabReviewsLog = [];
    data.vocabReviewsLog.push({ date: card.lastReviewedAt, word, rating });
    this.save(data);
  },

  dueVocabCards() {
    const data = this.load();
    const now = new Date();
    return (data.vocabPool || []).filter(v => !v.mastered && new Date(v.due) <= now);
  },

  vocabStats() {
    const pool = this.load().vocabPool || [];
    return {
      total: pool.length,
      mastered: pool.filter(v => v.mastered).length,
      due: this.dueVocabCards().length
    };
  },

  // Words reviewed in the last N days — used to feed speaking practice
  recentlyReviewedWords(days = 7) {
    const pool = this.load().vocabPool || [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return pool.filter(v => v.reviews > 0 && new Date(v.due) > cutoff);
  },

  allVocabWords() {
    return (this.load().vocabPool || []).slice().sort((a, b) => {
      if (a.mastered !== b.mastered) return a.mastered ? 1 : -1;
      return new Date(a.due) - new Date(b.due);
    });
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

  speakingSessionsToday() {
    const data = this.load();
    const today = new Date().toISOString().slice(0, 10);
    return (data.speakingHistory || []).filter(s => s.date.slice(0, 10) === today).length;
  },

  writingSessionsToday() {
    const data = this.load();
    const today = new Date().toISOString().slice(0, 10);
    return (data.writingHistory || []).filter(s => s.date.slice(0, 10) === today).length;
  },

  vocabReviewedToday() {
    const data = this.load();
    const log = data.vocabReviewsLog || [];
    const today = new Date().toISOString().slice(0, 10);
    return log.filter(r => r.date.slice(0, 10) === today).length;
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
