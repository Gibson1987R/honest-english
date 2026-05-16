// results.js — CEFR scoring + roadmap generation

const CEFR_INFO = {
  'Pre-A1': { label: 'Principiante absoluto', desc: 'Aún no manejas las bases. ¡Pero todos empezamos aquí!' },
  'A1': { label: 'Principiante (Beginner)', desc: 'Entiendes y usas frases muy básicas sobre temas cotidianos.' },
  'A2': { label: 'Elemental (Elementary)', desc: 'Te comunicas en tareas simples y rutinarias.' },
  'B1': { label: 'Intermedio (Intermediate)', desc: 'Manejas situaciones cotidianas con cierta independencia. Nivel común para empezar a usar inglés en trabajo.' },
  'B2': { label: 'Intermedio Alto (Upper-Intermediate)', desc: 'Entiendes ideas complejas, puedes interactuar con fluidez. Mínimo para muchos trabajos tech internacionales.' },
  'C1': { label: 'Avanzado (Advanced)', desc: 'Te expresas con fluidez y espontaneidad, usas el idioma con flexibilidad.' },
  'C2': { label: 'Maestría (Proficiency)', desc: 'Casi nativo. Comprendes todo sin esfuerzo.' }
};

function calculateCEFR(questions, answers) {
  const byLevel = { A1: { correct: 0, total: 0 }, A2: { correct: 0, total: 0 }, B1: { correct: 0, total: 0 }, B2: { correct: 0, total: 0 }, C1: { correct: 0, total: 0 }, C2: { correct: 0, total: 0 } };
  const bySkill = { vocab: { correct: 0, total: 0 }, grammar: { correct: 0, total: 0 }, reading: { correct: 0, total: 0 }, listening: { correct: 0, total: 0 } };
  let selfScore = { speaking: 0, speakingCount: 0, writing: 0, writingCount: 0 };

  questions.forEach((q, i) => {
    if (q.type === 'reading-text') return;
    if (q.type === 'self') {
      const val = answers[i] !== null ? answers[i] : 0;
      if (q.skill === 'speaking') { selfScore.speaking += val; selfScore.speakingCount++; }
      if (q.skill === 'writing') { selfScore.writing += val; selfScore.writingCount++; }
      return;
    }
    if (q.level && byLevel[q.level]) {
      byLevel[q.level].total++;
      if (answers[i] === q.correct) byLevel[q.level].correct++;
    }
    if (q.skill && bySkill[q.skill]) {
      bySkill[q.skill].total++;
      if (answers[i] === q.correct) bySkill[q.skill].correct++;
    }
  });

  const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  let cefr = 'A1';
  for (const lvl of levels) {
    const { correct, total } = byLevel[lvl];
    if (total > 0 && correct / total >= 0.6) {
      cefr = lvl;
    } else {
      break;
    }
  }
  if (byLevel.A1.correct === 0) cefr = 'Pre-A1';

  const speakingAvg = selfScore.speakingCount ? (selfScore.speaking / selfScore.speakingCount) : 0;
  const writingAvg = selfScore.writingCount ? (selfScore.writing / selfScore.writingCount) : 0;

  const total = Object.values(byLevel).reduce((a, b) => a + b.total, 0);
  const correct = Object.values(byLevel).reduce((a, b) => a + b.correct, 0);

  return { byLevel, bySkill, cefr, speakingAvg, writingAvg, total, correct };
}

function generateRoadmap(result) {
  const cefr = result.cefr;
  const readingPct = result.bySkill.reading.total ? result.bySkill.reading.correct / result.bySkill.reading.total : 0;
  const gap = readingPct - (result.speakingAvg / 4);

  let steps = [];

  if (cefr === 'Pre-A1' || cefr === 'A1') {
    steps = [
      { title: 'FASE 1 — Fundación (8-12 semanas)', body: 'Construye base con frases completas, no palabras sueltas. Usa <strong>BBC Learning English · Beginner</strong> 30 min/día. No saltes a apps "divertidas" tipo Duolingo más allá de 2 semanas.' },
      { title: 'FASE 2 — Input masivo (continuo)', body: 'Series sencillas en inglés con subtítulos en inglés. Empieza con <em>Friends</em> o <em>Peppa Pig</em>. Vocabulario simple y claro.' },
      { title: 'FASE 3 — Producción guiada (mes 3)', body: 'Empieza con <strong>ChatGPT modo voz</strong>, 10 min/día. Te quita el miedo a hablar.' },
      { title: 'FASE 4 — Tutor humano (al llegar a A2)', body: 'iTalki tutor económico, 2 veces/semana, 30 min. Aquí empieza el speaking real.' }
    ];
  } else if (cefr === 'A2') {
    steps = [
      { title: 'AHORA — Cierra brecha de comprensión', body: 'Series con subs en inglés, 30 min/día. <strong>BBC 6 Minute English</strong> en podcast. Anki con vocab que encuentres en contexto real.' },
      { title: 'SEMANA 2 — Empieza producción', body: 'Tandem o HelloTalk: 1 chat diario con nativo. Te corrigen gratis. Escribe 5 frases/día.' },
      { title: 'MES 1 — Speaking con AI', body: 'ChatGPT voz: 15 min/día. Anota palabras que no supiste decir y las practicas.' },
      { title: 'MES 2 — Tutor humano', body: 'iTalki 2x/semana, 30 min. Pide enfoque en gramática B1 (condicionales, present perfect).' },
      { title: 'META — Llegar a B1 en 4-6 meses', body: 'Es el primer umbral útil para trabajo. Aquí ya puedes hacer entrevistas técnicas básicas.' }
    ];
  } else if (cefr === 'B1') {
    steps = [
      { title: 'TU SITUACIÓN', body: 'Estás en el nivel mínimo útil para trabajar en inglés. Falta <strong>velocidad y confianza en speaking</strong>, no más teoría.' },
      { title: 'AHORA — Speaking diario, no negociable', body: 'iTalki 3-4x/semana, 30 min con tutor económico. Esto es lo que más mueve la aguja.' },
      { title: 'SUPLEMENTO — Input avanzado', body: 'Podcasts: <em>The Daily</em> (NYT), <em>Hidden Brain</em>. TED Talks. Películas sin subs cuando puedas.' },
      { title: 'WRITING — Práctica laboral', body: 'Escribe emails ficticios en inglés, pásalos por ChatGPT para corrección. 1 email "real" al día.' },
      { title: 'META — Llegar a B2 en 3-6 meses', body: 'B2 abre las puertas de trabajos tech internacionales.' }
    ];
  } else if (cefr === 'B2') {
    steps = [
      { title: 'TU SITUACIÓN', body: '¡Estás en el umbral profesional! Falta <strong>refinamiento</strong>: vocabulario específico, naturalidad, reducir errores.' },
      { title: 'ENFOQUE — Especialización', body: 'Vocab técnico de tu industria. Lee documentación, blogs técnicos, haz pull requests con comentarios en inglés.' },
      { title: 'SPEAKING — Conversación compleja', body: 'iTalki 2-3x/semana con tutor que pueda discutir temas profesionales. Mock interviews técnicas.' },
      { title: 'ENTREVISTAS', body: 'Pretto.io, Interviewing.io. Haz entrevistas técnicas reales en inglés.' },
      { title: 'META — C1 en 6-12 meses', body: 'C1 abre cualquier puerta internacional.' }
    ];
  } else {
    steps = [
      { title: 'TU SITUACIÓN', body: '¡Nivel alto! El inglés ya no es el cuello de botella — es práctica y matices.' },
      { title: 'MANTENIMIENTO', body: 'Conversación regular (1-2x/semana), input variado, escritura técnica frecuente.' },
      { title: 'PULIR', body: 'Pronunciación de sonidos específicos, idioms, registro formal vs informal.' },
      { title: 'CERTIFICACIÓN', body: 'Si necesitas papel: IELTS Academic o Cambridge C1 Advanced.' }
    ];
  }

  if (gap > 0.3 && (cefr === 'B1' || cefr === 'B2')) {
    steps.unshift({ title: '⚠️ DIAGNÓSTICO CLAVE', body: `Tu comprensión está muy por encima de tu producción. Es <strong>el patrón clásico del aprendiz auto-didacta</strong>. La única solución: forzar producción diaria. Hablar es un músculo, no un conocimiento.` });
  }

  return steps;
}
