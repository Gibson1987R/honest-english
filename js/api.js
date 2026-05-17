// api.js — BYOK API key storage and shared API helpers (OpenAI Whisper + Anthropic Claude)
const API_KEYS_STORAGE = 'honestEnglish.apiKeys';

const ApiKeys = {
  load() {
    try {
      const raw = localStorage.getItem(API_KEYS_STORAGE);
      return raw ? JSON.parse(raw) : { openai: '', anthropic: '' };
    } catch {
      return { openai: '', anthropic: '' };
    }
  },
  save(keys) {
    localStorage.setItem(API_KEYS_STORAGE, JSON.stringify(keys));
  },
  hasOpenAI() {
    return !!this.load().openai;
  },
  hasAnthropic() {
    return !!this.load().anthropic;
  },
  getOpenAI() {
    return this.load().openai;
  },
  getAnthropic() {
    return this.load().anthropic;
  }
};

// ===== OpenAI Whisper =====
async function transcribeWithWhisper(audioBlob) {
  const key = ApiKeys.getOpenAI();
  if (!key) throw new Error('No OpenAI key. Go to Settings.');

  const form = new FormData();
  form.append('file', audioBlob, 'recording.webm');
  form.append('model', 'whisper-1');
  form.append('language', 'en');
  form.append('response_format', 'json');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}` },
    body: form
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper error ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.text;
}

// ===== Anthropic Claude =====
async function callClaude(messages, options = {}) {
  const key = ApiKeys.getAnthropic();
  if (!key) throw new Error('No Anthropic key. Go to Settings.');

  const body = {
    model: options.model || 'claude-haiku-4-5-20251001',
    max_tokens: options.max_tokens || 2048,
    messages,
    ...(options.system ? { system: options.system } : {})
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude error ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.content[0].text;
}

// Helper: parse JSON from Claude's response (it sometimes wraps in markdown)
function parseJSONFromClaude(text) {
  let cleaned = text.trim();
  const jsonBlock = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonBlock) cleaned = jsonBlock[1];
  return JSON.parse(cleaned);
}
