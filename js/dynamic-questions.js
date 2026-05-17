// dynamic-questions.js — Phase 3: generate CEFR questions with Claude

const GENERATED_CACHE_KEY = 'honestEnglish.generatedQuestions';

function loadCachedGenerated() {
  try {
    return JSON.parse(localStorage.getItem(GENERATED_CACHE_KEY) || '[]');
  } catch { return []; }
}

function saveCachedGenerated(arr) {
  // Keep last 100 generated questions max
  localStorage.setItem(GENERATED_CACHE_KEY, JSON.stringify(arr.slice(-100)));
}

const GEN_SYSTEM_PROMPT = `You are an expert CEFR English assessment writer. You create multiple-choice questions calibrated to specific CEFR levels (A1, A2, B1, B2, C1, C2).

Your questions test real understanding, not memorization. They include one distractor that is a common mistake made by Spanish speakers.

You ONLY respond with valid JSON. No prose, no markdown, just the JSON array.`;

function buildGenPrompt(targetLevel, count = 8) {
  // Pick a spread of skills around the target level
  const levelsAroundTarget = {
    'A1': ['A1', 'A1', 'A2'],
    'A2': ['A1', 'A2', 'A2', 'B1'],
    'B1': ['A2', 'B1', 'B1', 'B2'],
    'B2': ['B1', 'B2', 'B2', 'C1'],
    'C1': ['B2', 'C1', 'C1', 'C2'],
    'C2': ['C1', 'C2', 'C2']
  };
  const levels = levelsAroundTarget[targetLevel] || ['A2', 'B1'];

  return `Generate exactly ${count} multiple-choice English questions. Distribute them across these CEFR levels: ${levels.join(', ')} (and similar).

Mix the skills evenly: grammar, vocab, reading (give a short context as part of the question if reading).

Output a JSON array. Each item has this exact shape:
{
  "level": "A2",       // CEFR level
  "skill": "grammar",  // "grammar" | "vocab" | "reading"
  "q": "The question text with ___ for blanks if needed",
  "options": ["opt 1", "opt 2", "opt 3", "opt 4"],   // exactly 4 options
  "correct": 0,        // index of correct answer (0-3)
  "note": "optional one-line explanation"
}

Rules:
- 4 options always.
- Make distractors plausible. Include at least one that's a common Spanish-speaker mistake.
- Keep questions short and contextual, not isolated.
- Do NOT repeat questions from common practice books.
- Output ONLY the JSON array. No surrounding text.`;
}

async function generateQuestions(targetLevel, count = 8) {
  if (!ApiKeys.hasAnthropic()) {
    throw new Error('Necesitas tu API key de Anthropic. Ve a Settings.');
  }

  const text = await callClaude(
    [{ role: 'user', content: buildGenPrompt(targetLevel, count) }],
    {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      system: GEN_SYSTEM_PROMPT
    }
  );

  let parsed;
  try {
    parsed = parseJSONFromClaude(text);
  } catch (e) {
    throw new Error('Claude devolvió un JSON inválido. Intenta otra vez.');
  }

  // Basic validation
  const valid = parsed.filter(q =>
    q.level && q.skill && q.q && Array.isArray(q.options) && q.options.length === 4 && typeof q.correct === 'number'
  );
  if (!valid.length) {
    throw new Error('Claude generó preguntas inválidas. Intenta otra vez.');
  }

  // Cache them
  const cache = loadCachedGenerated();
  saveCachedGenerated([...cache, ...valid]);

  return valid;
}
