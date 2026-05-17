# Changelog

All notable changes to honest-english will be documented in this file.

## [0.4.0] — 2026-05-17

### Added — Phase 4: Writing
- `writing.html` page with leveled writing prompts
- Claude API integration (BYOK) for honest writing feedback
- Tracker now records writing sessions

## [0.3.0] — 2026-05-17

### Added — Phase 3: Dynamic Questions
- "Generate fresh questions" button in test
- Claude API integration (BYOK) generates CEFR-calibrated questions
- Generated questions cached in localStorage to avoid waste

## [0.2.0] — 2026-05-17

### Added — Phase 2: Whisper
- BYOK OpenAI key flow on `settings.html`
- Optional Whisper backend for pronunciation (more accurate than Web Speech)
- MediaRecorder fallback when Whisper is enabled
- Per-attempt Whisper transcripts saved in tracker

## [0.1.0] — 2026-05-16

### Added — Phase 1: MVP
- CEFR test (A1–C2) with 30+ calibrated questions across grammar, vocab, reading, and listening
- Web Speech API speaking module with word-level scoring
- Brutal-honesty dashboard with streak tracking and warnings
- Roadmap generation based on detected level + comprehension/production gap
- Curated resources auto-filtered by level
- All data persisted in `localStorage`
