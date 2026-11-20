"use strict";
const BOT = "chatgpt-codex-connector[bot]";
const CHECK = "Quality Gate";
const normalize = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const substantive = (s) => {
  const text = normalize(s)
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  return (
    text.length >= 24 && !/^(pendiente|tbd|todo|n\/?a|no aplica|por completar)[.!\s]*$/.test(text)
  );
};
function sections(body) {
  const out = {};
  let key = "";
  for (const line of String(body || "")
    .slice(0, 65536)
    .split("\n")) {
    const match = /^#{1,4}\s+(.+?)\s*$/.exec(line);
    if (match) {
      key = normalize(match[1]);
      out[key] = "";
    } else if (key) out[key] += `${line}\n`;
  }
  return out;
}
function field(body, patterns) {
  const entries = Object.entries(sections(body));
  return entries
    .filter(([key]) => patterns.some((pattern) => pattern.test(key)))
    .map(([, value]) => value)
    .join("\n");
}
function issueNumbers(body, owner, repo) {
  const found = new Set();
  const text = String(body || "").slice(0, 65536);
  for (const m of text.matchAll(/https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)/g)) {
    if (normalize(m[1]) === normalize(owner) && normalize(m[2]) === normalize(repo))
      found.add(Number(m[3]));
  }
  const noUrls = text.replace(/https?:\/\/\S+/g, "");
  for (const m of noUrls.matchAll(/(?:^|[\s(])#(\d+)\b/g)) found.add(Number(m[1]));
  return [...found].filter((n) => n > 0 && Number.isSafeInteger(n)).slice(0, 10);
}
function validateIssue(issue) {
  const problems = [];
  if (issue.pull_request) return ["La referencia debe ser un issue, no otro PR."];
  const story = field(issue.body, [/historia de usuario/, /user story/]);
  if (
    !substantive(story) ||
    !/\bcomo\b[\s\S]*\bquiero\b[\s\S]*\bpara\b|\bas a\b[\s\S]*\bi want\b[\s\S]*\bso that\b/.test(
      normalize(story),
    )
  ) {
    problems.push("El issue necesita una historia de usuario: rol, necesidad y beneficio.");
  }
  if (!substantive(field(issue.body, [/problema/, /problem/])))
    problems.push("Falta el problema concreto en el issue.");
  if (!substantive(field(issue.body, [/solucion/, /solution/, /propuesta/, /proposal/])))
    problems.push("Falta la solución propuesta en el issue.");
  const criteria = field(issue.body, [/criterios de aceptacion/, /acceptance criteria/]);
  if (!substantive(criteria) || !/^\s*[-*]\s+/m.test(criteria))
    problems.push("Faltan criterios de aceptación comprobables en el issue.");
  return problems;
}
function validatePR(body) {
  const required = [
    ["objetivo y solución", [/objetivo/, /solucion/, /solution/, /summary/]],
    ["validación", [/validacion/, /validation/, /testing/]],
    ["regresión", [/regresion/, /regression/]],
    ["seguridad", [/seguridad/, /security/]],
    ["documentación", [/documentacion/, /documentation/]],
    ["riesgos y reversión", [/riesgo/, /risk/, /reversion/, /rollback/]],
  ];
  return required
    .filter(([, patterns]) => !substantive(field(body, patterns)))
    .map(([label]) => `Falta explicar ${label} en el PR; una plantilla vacía no es evidencia.`);
}
function codexStates(comments, sha) {
  const states = { code_review: null, security_review: null };
  for (const comment of comments) {
    if (
      comment.user?.login !== BOT ||
      comment.user?.type !== "Bot" ||
      comment.verified_editor !== true
    )
      continue;
    const match = /<!--\s*codex-review-state:v1\s+({[\s\S]*?})\s*-->/.exec(comment.body || "");
    if (!match) continue;
    let parsed;
    try {
      parsed = JSON.parse(match[1]);
    } catch {
      continue;
    }
    for (const key of Object.keys(states)) {
      if (parsed[key]?.commit_sha === sha) states[key] = parsed[key];
    }
  }
  return states;
}
function classifyEvidence({
  problems = [],
  pending = [],
  runs = {},
  reviews = {},
  unresolved = 0,
}) {
  const failed = [...problems];
  const waiting = [...pending];
  for (const key of ["tests", "security"]) {
    const run = runs[key];
    if (run?.status !== "completed")
      waiting.push(
        `Falta completar Quality ${key === "tests" ? "Tests" : "Security"} para esta versión.`,
      );
    else if (run.conclusion !== "success")
      failed.push(
        `Quality ${key === "tests" ? "Tests" : "Security"} no pasó (${run.conclusion || "sin resultado"}).`,
      );
  }
  for (const [key, label] of [
    ["code_review", "código"],
    ["security_review", "seguridad"],
  ]) {
    const review = reviews[key];
    if (review?.status !== "completed")
      waiting.push(`Falta la revisión de ${label} de Codex para esta versión.`);
    else if (review.has_any_findings === true || review.has_unresolved_findings === true)
      failed.push(`La revisión de ${label} de Codex tiene hallazgos; consultar el informe.`);
    else if (review.has_any_findings !== false || review.has_unresolved_findings !== false)
      waiting.push(`La revisión de ${label} no contiene un resultado concluyente.`);
  }
  if (unresolved > 0) failed.push(`Quedan ${unresolved} hilos de revisión sin resolver.`);
  return {
    state: failed.length ? "changes_required" : waiting.length ? "incomplete" : "ready_for_owner",
    failed,
    waiting,
  };
}
async function reviewPR({ github, context, core }, number) {
  const { owner, repo } = context.repo;
  const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number: number });
  if (pr.state !== "open") return;
  const sha = pr.head.sha;
  const problems = validatePR(pr.body);
  const pending = [];
  if (pr.draft) pending.push("El PR sigue siendo borrador.");
  const issueIds = issueNumbers(pr.body, owner, repo);
  if (!issueIds.length)
    problems.push(
      "Vincula un issue del mismo repositorio con historia de usuario y criterios de aceptación.",
    );
  for (const issue_number of issueIds) {
    try {
      const { data: issue } = await github.rest.issues.get({ owner, repo, issue_number });
      problems.push(...validateIssue(issue));
    } catch {
      pending.push(`No se pudo consultar el issue vinculado ${issue_number}.`);
    }
  }
  const comments = [];
  let commentCursor = null;
  do {
    const result = await github.graphql(
      `query($owner:String!,$repo:String!,$number:Int!,$cursor:String){repository(owner:$owner,name:$repo){pullRequest(number:$number){comments(first:100,after:$cursor){nodes{databaseId body author{login __typename} editor{login __typename} createdAt updatedAt lastEditedAt}pageInfo{hasNextPage endCursor}}}}}`,
      { owner, repo, number, cursor: commentCursor },
    );
    const page = result.repository.pullRequest.comments;
    for (const item of page.nodes) {
      const author = item.author;
      const validDates =
        Number.isFinite(Date.parse(item.createdAt)) && Number.isFinite(Date.parse(item.updatedAt));
      const untouched = validDates && !item.lastEditedAt && item.createdAt === item.updatedAt;
      const sameEditor =
        validDates &&
        item.lastEditedAt &&
        item.editor?.login === author?.login &&
        item.editor?.__typename === author?.__typename;
      comments.push({
        body: item.body,
        user: {
          login: author?.login + (author?.__typename === "Bot" ? "[bot]" : ""),
          type: author?.__typename,
        },
        verified_editor: Boolean(untouched || sameEditor),
        unedited: Boolean(untouched),
      });
    }
    commentCursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (commentCursor);
  const changed = await github.paginate(github.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: number,
    per_page: 100,
  });
  const sensitive = changed.filter((file) =>
    [file.filename, file.previous_filename]
      .filter(Boolean)
      .some((path) =>
        /^(?:\.github\/|(?:.*\/)?AGENTS\.md$|(?:.*\/)?SECURITY\.md$|(?:.*\/)?(?:bunfig\.toml|vitest\.config\.[^/]+|jest\.config\.[^/]+|playwright\.config\.[^/]+|conftest\.py|package\.json|package-lock\.json|bun\.lockb?|yarn\.lock|pnpm-lock\.yaml|pyproject\.toml|pytest\.ini|tox\.ini|setup\.cfg|requirements[^/]*\.txt)$|\.trivy|trivy|\.gitleaks|gitleaks|\.semgrep|semgrep)/i.test(
          path,
        ),
      ),
  );
  if (
    sensitive.length &&
    !comments.some(
      (comment) =>
        comment.user?.login === "Gibson1987R" &&
        comment.user?.type === "User" &&
        comment.unedited === true &&
        comment.body?.trim() === `quality-policy-approved: ${sha}`,
    )
  ) {
    pending.push(
      `Se modifican controles o reglas de revisión. Gibson debe revisar el diff y confirmar quality-policy-approved: ${sha}. Esta confirmación técnica no autoriza el merge.`,
    );
  }
  const parallel = await github.paginate(github.rest.pulls.list, {
    owner,
    repo,
    state: "open",
    per_page: 100,
  });
  if (parallel.filter((item) => item.head.sha === sha).length > 1)
    pending.push(
      "Varios PR abiertos comparten este SHA: separar las ramas o cerrar el duplicado antes de aprobar para evitar resultados cruzados.",
    );
  const reviews = codexStates(comments, sha);
  const { data: runData } = await github.rest.actions.listWorkflowRunsForRepo({
    owner,
    repo,
    head_sha: sha,
    event: "pull_request",
    per_page: 100,
  });
  const runs = {};
  for (const [key, file] of [
    ["tests", "quality-tests.yml"],
    ["security", "quality-security.yml"],
  ]) {
    runs[key] = runData.workflow_runs
      .filter(
        (run) => run.head_sha === sha && run.path?.split("@")[0] === `.github/workflows/${file}`,
      )
      .sort((a, b) => b.id - a.id || b.run_attempt - a.run_attempt)[0];
  }
  let unresolved = 0;
  try {
    let cursor = null;
    do {
      const data = await github.graphql(
        `query($owner:String!,$repo:String!,$number:Int!,$cursor:String){repository(owner:$owner,name:$repo){pullRequest(number:$number){reviewThreads(first:100,after:$cursor){nodes{isResolved}pageInfo{hasNextPage endCursor}}}}}`,
        { owner, repo, number, cursor },
      );
      const threads = data.repository.pullRequest.reviewThreads;
      unresolved += threads.nodes.filter((node) => !node.isResolved).length;
      cursor = threads.pageInfo.hasNextPage ? threads.pageInfo.endCursor : null;
    } while (cursor);
  } catch {
    pending.push("No se pudieron verificar los hilos de revisión; no se da por aprobado.");
  }
  const formalReviews = await github.paginate(github.rest.pulls.listReviews, {
    owner,
    repo,
    pull_number: number,
    per_page: 100,
  });
  const decisions = new Map();
  for (const review of formalReviews) {
    if (["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(review.state))
      decisions.set(review.user.id, review.state);
  }
  if ([...decisions.values()].includes("CHANGES_REQUESTED"))
    problems.push("Un revisor mantiene una solicitud de cambios.");
  try {
    const { data: comparison } = await github.rest.repos.compareCommitsWithBasehead({
      owner,
      repo,
      basehead: `${pr.base.sha}...${sha}`,
    });
    if (!["ahead", "identical"].includes(comparison.status))
      pending.push("La rama no incluye la base actual; actualizarla y volver a validar.");
  } catch {
    pending.push("No se pudo verificar la actualización frente a la rama base.");
  }
  const outcome = classifyEvidence({ problems, pending, runs, reviews, unresolved });
  const { data: current } = await github.rest.pulls.get({ owner, repo, pull_number: number });
  if (current.head.sha !== sha || current.base.sha !== pr.base.sha) {
    core.notice(
      "La versión o la base cambió durante la evaluación; no se publica un resultado obsoleto.",
    );
    return;
  }
  const titles = {
    changes_required: "Requiere correcciones",
    incomplete: "Evaluación incompleta",
    ready_for_owner: "Listo para solicitar autorización de merge",
  };
  const details = [...outcome.failed, ...outcome.waiting]
    .map((message) => `- ${message}`)
    .join("\n");
  const marker = `<!-- quality-gate:v1:${sha}:${pr.base.sha}:${outcome.state} -->`;
  const body = `${marker}\n## ${titles[outcome.state]}\n\nVersión evaluada: \`${sha}\`.\n\n${details || "Los controles configurados y las revisiones de esta versión están completos, sin bloqueos conocidos."}\n\n**La integración requiere autorización explícita de Gibson para este PR y esta versión. Este sistema no ejecuta merges.**\n\nLa persona o agente que envió el cambio debe informar a Gibson del resultado y esperar su decisión antes de corregir o integrar. Una revisión sin hallazgos no certifica ausencia absoluta de errores.\n\n[Pruebas](${runs.tests?.html_url || `${pr.html_url}/checks`}) · [Seguridad](${runs.security?.html_url || `${pr.html_url}/checks`})`;
  const checks = await github.rest.checks.listForRef({
    owner,
    repo,
    ref: sha,
    check_name: CHECK,
    per_page: 100,
  });
  const ownCheck = checks.data.check_runs.find(
    (check) => check.name === CHECK && check.app?.slug === "github-actions",
  );
  const checkData = {
    owner,
    repo,
    name: CHECK,
    head_sha: sha,
    status: "completed",
    conclusion: outcome.state === "ready_for_owner" ? "success" : "failure",
    output: { title: titles[outcome.state], summary: body.slice(0, 60000) },
    details_url: `${pr.html_url}/checks`,
  };
  if (ownCheck) {
    const { head_sha, ...update } = checkData;
    await github.rest.checks.update({ ...update, check_run_id: ownCheck.id });
  } else await github.rest.checks.create(checkData);
  if (
    !comments.some(
      (comment) =>
        comment.user?.type === "Bot" &&
        comment.user?.login === "github-actions[bot]" &&
        comment.body === body,
    )
  ) {
    await github.rest.issues.createComment({ owner, repo, issue_number: number, body });
  }
  core.info(`${owner}/${repo}: ${titles[outcome.state]}`);
}
async function main(args) {
  const { github, context, core } = args;
  const event = context.payload;
  if (
    context.eventName === "issue_comment" &&
    !(
      (event.comment?.user?.login === BOT && event.comment?.user?.type === "Bot") ||
      (event.comment?.user?.login === "Gibson1987R" && event.comment?.user?.type === "User")
    )
  )
    return;
  // Barrido completo: un evento pendiente reemplazado en concurrency no pierde otro PR.
  const prs = await github.paginate(github.rest.pulls.list, {
    ...context.repo,
    state: "open",
    per_page: 100,
  });
  const numbers = prs.map((pr) => pr.number);
  for (const number of numbers) {
    try {
      await reviewPR(args, number);
    } catch (error) {
      core.setFailed(
        `No se pudo completar la evaluación del PR ${number}: ${error.status || error.name || "error"}. No se aprueba por omisión.`,
      );
      try {
        const { data: current } = await github.rest.pulls.get({
          ...context.repo,
          pull_number: number,
        });
        await github.rest.checks.create({
          ...context.repo,
          name: CHECK,
          head_sha: current.head.sha,
          status: "completed",
          conclusion: "failure",
          output: {
            title: "Evaluación interrumpida",
            summary:
              "Falló la consulta de evidencia. No usar un informe verde anterior; repetir Quality Policy y consultar todos los checks antes de solicitar merge.",
          },
        });
      } catch {
        core.error(
          "No se pudo invalidar el resultado anterior en GitHub. El workflow fallido impide afirmar aprobación; no integrar hasta recuperar y repetir la evaluación.",
        );
      }
    }
  }
}
module.exports = {
  main,
  reviewPR,
  sections,
  issueNumbers,
  validateIssue,
  validatePR,
  codexStates,
  classifyEvidence,
};
