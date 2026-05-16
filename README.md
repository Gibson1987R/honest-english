# honest-english

A brutally honest English-learning tracker. Built by a Spanish-speaking developer
learning English the hard way — and refusing to lie to himself about progress.

**Live:** _(deploy pending)_

## Why this exists

Most language apps gamify the wrong thing. They reward streaks of *opening the app*
instead of streaks of *actually speaking the language*. This project does the opposite:

- It measures **real production** (you must speak out loud, daily).
- It tracks the gap between **comprehension and production** — the classic trap of
  the self-taught learner.
- It tells you the truth: *"You haven't practiced speaking in 7 days. The muscle
  is atrophying."*

## Features

### Phase 1 (current MVP)

- **CEFR Test** — 30+ questions calibrated A1–C2 across grammar, vocabulary,
  reading, and listening. Maps you to a real international level.
- **Speaking Module** — the killer feature. Web Speech API:
  - Text-to-speech reads the prompt
  - You record yourself saying it
  - Speech recognition transcribes your voice
  - Word-by-word comparison with score (0-100)
  - Tracks every session locally
- **Dynamic Roadmap** — depends on your level and the gap between your
  comprehension and your production. No generic advice.
- **Resources Filtered by Level** — curated list (iTalki, Tandem, BBC,
  Anki, etc.) automatically filtered to your CEFR level.
- **Brutal-Honesty Dashboard** — streak counter, days since last practice,
  honest warnings when you're slipping.

### Roadmap

- **Phase 2:** Detailed pronunciation feedback (Whisper API integration).
- **Phase 3:** Dynamic question generation via Claude API (BYOK).
- **Phase 4:** Writing module with AI corrections.

## Stack

Vanilla HTML, CSS, and JavaScript. No build step. No framework.
Hosted on GitHub Pages. All data lives in `localStorage`.

```
honest-english/
├── index.html         dashboard
├── test.html          CEFR test
├── speaking.html      speaking + pronunciation
├── styles.css
├── js/
│   ├── tracker.js     localStorage persistence + honest stats
│   ├── test.js        test logic
│   ├── speaking.js    Web Speech API integration
│   ├── results.js     CEFR scoring + roadmap generation
│   └── resources.js   filter + render curated resources
└── data/
    ├── questions.json
    ├── prompts.json
    └── resources.json
```

## Run locally

`SpeechRecognition` requires HTTPS or localhost. Don't open the files directly:

```bash
cd honest-english
python3 -m http.server 8080
# open http://localhost:8080
```

## Browser support

- Chrome / Edge — full support (recommended)
- Safari (Mac) — full support
- Firefox — speaking module not available (no SpeechRecognition)

## Honest disclaimers

- The CEFR score is an **approximation**, not an official certification.
- Speech recognition measures *intelligibility*, not native accent.
- This tool is useless if you don't actually practice. It tracks you; it doesn't
  do the work for you.

## License

MIT. Build your own. Be honest with yourself.
