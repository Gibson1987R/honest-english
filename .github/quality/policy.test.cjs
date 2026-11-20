const { test } = require("node:test");
const assert = require("node:assert/strict");
const policy = require("./policy.cjs");
const sha = "a".repeat(40),
  old = "b".repeat(40);
const complete = {
  commit_sha: sha,
  status: "completed",
  has_any_findings: false,
  has_unresolved_findings: false,
};
const good = () => ({
  runs: {
    tests: { status: "completed", conclusion: "success" },
    security: { status: "completed", conclusion: "success" },
  },
  reviews: { code_review: { ...complete }, security_review: { ...complete } },
});
const issue = {
  body: "## Problema\nLos atletas carecen de una ficha accesible durante su sesión.\n## Historia de usuario\nComo atleta quiero consultar una ficha para aprender la técnica del ejercicio actual.\n## Solución propuesta\nServir una ficha por ejercicio desde la aplicación con sus medios.\n## Criterios de aceptación\n- El ejercicio actual devuelve su ficha y muestra un estado claro si falta.\n",
};
test("exige historia, problema, solución y aceptación, no solo una referencia", () => {
  assert.deepEqual(policy.validateIssue(issue), []);
  assert.equal(policy.validateIssue({ body: "Fix bug" }).length, 4);
});
test("una plantilla vacía no satisface la historia de usuario", () => {
  assert.ok(
    policy
      .validateIssue({ body: issue.body.replace(/Como atleta[^\n]+/, "<!-- pendiente -->") })
      .some((x) => x.includes("historia")),
  );
});
test("no usa otro PR como historia de usuario", () =>
  assert.deepEqual(policy.validateIssue({ ...issue, pull_request: {} }), [
    "La referencia debe ser un issue, no otro PR.",
  ]));
test("referencias de issue se limitan al repositorio actual y se deduplican", () => {
  assert.deepEqual(
    policy.issueNumbers(
      "Related #12 https://github.com/o/r/issues/12 https://github.com/other/r/issues/4\n #7",
      "o",
      "r",
    ),
    [12, 7],
  );
});
test("no acepta un PR sin regresión, seguridad, documentación ni límites", () => {
  assert.ok(
    policy.validatePR("## Objetivo\nResolver el fallo de autorización comprobado en la sesión.")
      .length >= 5,
  );
});
test("no acepta suplantación del resultado de Codex por el autor del PR", () => {
  const body = `<!-- codex-review-state:v1 ${JSON.stringify({ code_review: complete, security_review: complete })} -->`;
  assert.equal(
    policy.codexStates([{ user: { login: "Gibson1987R", type: "User" }, body }], sha).code_review,
    null,
  );
  assert.equal(
    policy.codexStates(
      [{ user: { login: "chatgpt-codex-connector[bot]", type: "User" }, body }],
      sha,
    ).code_review,
    null,
  );
});
test("una revisión de la versión anterior no aprueba el nuevo código", () => {
  const body = `<!-- codex-review-state:v1 ${JSON.stringify({ code_review: { ...complete, commit_sha: old } })} -->`;
  assert.equal(
    policy.codexStates(
      [
        {
          user: { login: "chatgpt-codex-connector[bot]", type: "Bot" },
          verified_editor: true,
          body,
        },
      ],
      sha,
    ).code_review,
    null,
  );
});
test("una revisión en progreso nunca se presenta como aprobada", () => {
  const data = good();
  data.reviews.code_review.status = "running";
  assert.equal(policy.classifyEvidence(data).state, "incomplete");
});
test("toda evidencia ausente queda incompleta, no éxito por omisión", () => {
  const result = policy.classifyEvidence({});
  assert.equal(result.state, "incomplete");
  assert.equal(result.waiting.length, 4);
});
test("un test fallido exige corrección aunque Codex no encuentre problemas", () => {
  const data = good();
  data.runs.tests.conclusion = "failure";
  assert.equal(policy.classifyEvidence(data).state, "changes_required");
});
test("un control omitido, neutral o cancelado no cuenta como exitoso", () => {
  for (const conclusion of ["skipped", "neutral", "cancelled", "timed_out"]) {
    const data = good();
    data.runs.security.conclusion = conclusion;
    assert.notEqual(policy.classifyEvidence(data).state, "ready_for_owner");
  }
});
test("hallazgos de seguridad impiden el estado listo", () => {
  const data = good();
  data.reviews.security_review.has_any_findings = true;
  assert.equal(policy.classifyEvidence(data).state, "changes_required");
});
test("respuesta sin hallazgos con campos indeterminados no se presume concluyente", () => {
  const data = good();
  data.reviews.security_review.has_any_findings = null;
  assert.equal(policy.classifyEvidence(data).state, "incomplete");
});
test("un hilo abierto impide solicitar merge", () =>
  assert.equal(policy.classifyEvidence({ ...good(), unresolved: 1 }).state, "changes_required"));
test("todos los controles correctos solo habilitan pedir permiso, no fusionar", () => {
  assert.equal(policy.classifyEvidence(good()).state, "ready_for_owner");
});
test("un comentario malformado de Codex no rompe el control ni crea aprobación", () => {
  assert.equal(
    policy.codexStates(
      [
        {
          user: { login: "chatgpt-codex-connector[bot]", type: "Bot" },
          verified_editor: true,
          body: "<!-- codex-review-state:v1 {invalid} -->",
        },
      ],
      sha,
    ).code_review,
    null,
  );
});

function apiFixture({
  changedHead = false,
  securityFailure = false,
  unresolved = 0,
  commentsExtra = [],
  foreignEditor = false,
} = {}) {
  const writes = [];
  const body = `${["Objetivo y solución", "Validación", "Regresión", "Seguridad", "Documentación", "Riesgos y reversión"].map((title) => `## ${title}\nSe adjunta evidencia concreta de este cambio y se describen sus límites.\n`).join("")}\nRelacionado #12`;
  const summary = {
    user: { login: "chatgpt-codex-connector[bot]", type: "Bot" },
    verified_editor: true,
    body: `<!-- codex-review-state:v1 ${JSON.stringify({ code_review: complete, security_review: complete })} -->`,
  };
  let reads = 0;
  const github = {
    rest: {
      pulls: {
        get: async () => ({
          data: {
            state: "open",
            body,
            html_url: "https://github.com/o/r/pull/2",
            head: { sha: changedHead && ++reads > 1 ? old : sha },
            base: { sha: old },
          },
        }),
        listReviews: async () => [],
        listFiles: async () => [],
        list: async () => [{ number: 2, head: { sha } }],
      },
      issues: {
        get: async () => ({ data: issue }),
        listComments: async () => [summary, ...commentsExtra],
        createComment: async (input) => writes.push(["comment", input]),
      },
      actions: {
        listWorkflowRunsForRepo: async () => ({
          data: {
            workflow_runs: ["tests", "security"].map((key, index) => ({
              id: index,
              path: `.github/workflows/quality-${key}.yml`,
              head_sha: sha,
              status: "completed",
              conclusion: securityFailure && key === "security" ? "failure" : "success",
              html_url: "https://github.com/o/r/actions/runs/1",
            })),
          },
        }),
      },
      repos: { compareCommitsWithBasehead: async () => ({ data: { status: "ahead" } }) },
      checks: {
        listForRef: async () => ({ data: { check_runs: [] } }),
        create: async (input) => writes.push(["check", input]),
      },
    },
    paginate: async (fn, args) => fn(args),
    graphql: async () => ({
      repository: {
        pullRequest: {
          comments: {
            nodes: [summary, ...commentsExtra].map((c) => ({
              body: c.body,
              author: { login: c.user.login.replace(/\[bot\]$/, ""), __typename: c.user.type },
              createdAt: "2026-11-20T00:00:00Z",
              updatedAt: foreignEditor ? "2026-11-20T01:00:00Z" : "2026-11-20T00:00:00Z",
              lastEditedAt: foreignEditor ? "2026-11-20T01:00:00Z" : null,
              editor: foreignEditor ? { login: "collaborator", __typename: "User" } : null,
            })),
            pageInfo: { hasNextPage: false },
          },
          reviewThreads: {
            nodes: Array.from({ length: unresolved }, () => ({ isResolved: false })),
            pageInfo: { hasNextPage: false },
          },
        },
      },
    }),
  };
  return {
    writes,
    args: {
      github,
      context: { repo: { owner: "o", repo: "r" } },
      core: { notice() {}, info() {} },
    },
  };
}
test("flujo completo consulta evidencia y publica estado listo solo para la versión actual", async () => {
  const fixture = apiFixture();
  await policy.reviewPR(fixture.args, 2);
  assert.equal(fixture.writes.length, 2);
  const check = fixture.writes.find(([kind]) => kind === "check")[1];
  assert.equal(check.head_sha, sha);
  assert.equal(check.conclusion, "success");
  assert.match(check.output.summary, /requiere autorización explícita de Gibson/);
});
test("un cambio durante la revisión impide publicar aprobación obsoleta", async () => {
  const fixture = apiFixture({ changedHead: true });
  await policy.reviewPR(fixture.args, 2);
  assert.equal(fixture.writes.length, 0);
});
test("un escaneo fallido genera control fallido y feedback de corrección", async () => {
  const fixture = apiFixture({ securityFailure: true });
  await policy.reviewPR(fixture.args, 2);
  assert.equal(fixture.writes.find(([kind]) => kind === "check")[1].conclusion, "failure");
  assert.match(
    fixture.writes.find(([kind]) => kind === "comment")[1].body,
    /Requiere correcciones/,
  );
});
test("los hilos sin resolver siguen bloqueando aunque todas las suites pasen", async () => {
  const fixture = apiFixture({ unresolved: 1 });
  await policy.reviewPR(fixture.args, 2);
  assert.equal(fixture.writes.find(([kind]) => kind === "check")[1].conclusion, "failure");
});

test("no acepta un PR que cambia sus propios controles sin revisión explícita del propietario", async () => {
  const fixture = apiFixture();
  fixture.args.github.rest.pulls.listFiles = async () => [
    { filename: ".github/workflows/quality-security.yml" },
  ];
  await policy.reviewPR(fixture.args, 2);
  assert.equal(fixture.writes[0][1].conclusion, "failure");
  assert.match(fixture.writes[0][1].output.summary, /quality-policy-approved/);
});
test("confirmación técnica del propietario no implica merge y solo aplica al SHA actual", async () => {
  for (const [login, commit, expected] of [
    ["otra-persona", sha, "failure"],
    ["Gibson1987R", old, "failure"],
    ["Gibson1987R", sha, "success"],
  ]) {
    const fixture = apiFixture({
      commentsExtra: [
        { user: { login, type: "User" }, body: `quality-policy-approved: ${commit}` },
      ],
    });
    fixture.args.github.rest.pulls.listFiles = async () => [
      { filename: ".github/quality/project.json" },
    ];
    await policy.reviewPR(fixture.args, 2);
    assert.equal(fixture.writes[0][1].conclusion, expected);
  }
});
test("dos PR con el mismo SHA no se aprueban cruzando evidencia de ramas base distintas", async () => {
  const fixture = apiFixture();
  fixture.args.github.rest.pulls.list = async () => [
    { number: 2, head: { sha } },
    { number: 3, head: { sha } },
  ];
  await policy.reviewPR(fixture.args, 2);
  assert.equal(fixture.writes[0][1].conclusion, "failure");
});

test("un tercero no puede aprobar editando comentarios originales del bot o del propietario", async () => {
  const fixture = apiFixture({
    foreignEditor: true,
    commentsExtra: [
      { user: { login: "Gibson1987R", type: "User" }, body: `quality-policy-approved: ${sha}` },
    ],
  });
  fixture.args.github.rest.pulls.listFiles = async () => [
    { filename: ".github/quality/project.json" },
  ];
  await policy.reviewPR(fixture.args, 2);
  assert.equal(fixture.writes[0][1].conclusion, "failure");
  assert.match(fixture.writes[0][1].output.summary, /Falta la revisión/);
  assert.match(fixture.writes[0][1].output.summary, /quality-policy-approved/);
});
test("un error de consulta invalida el verde previo con fallo explícito", async () => {
  const fixture = apiFixture();
  fixture.args.context = { ...fixture.args.context, eventName: "workflow_dispatch", payload: {} };
  fixture.args.core = { ...fixture.args.core, setFailed() {}, error() {} };
  fixture.args.github.rest.pulls.listFiles = async () => {
    throw new Error("API unavailable");
  };
  await policy.main(fixture.args);
  assert.equal(fixture.writes[0][1].conclusion, "failure");
  assert.equal(fixture.writes[0][1].output.title, "Evaluación interrumpida");
});

test("también exige revisión especial al cambiar instrucciones anidadas", async () => {
  const fixture = apiFixture();
  fixture.args.github.rest.pulls.listFiles = async () => [{ filename: "apps/web/AGENTS.md" }];
  await policy.reviewPR(fixture.args, 2);
  assert.equal(fixture.writes[0][1].conclusion, "failure");
});

test("una aprobación editada o eliminada vuelve a evaluar e invalida el resultado", async () => {
  for (const action of ["edited", "deleted"]) {
    const fixture = apiFixture();
    fixture.args.context = {
      ...fixture.args.context,
      eventName: "issue_comment",
      payload: {
        action,
        comment: { user: { login: "Gibson1987R", type: "User" }, body: "Retiro mi aprobación" },
      },
    };
    fixture.args.github.rest.pulls.listFiles = async () => [
      { filename: ".github/quality/project.json" },
    ];
    await policy.main(fixture.args);
    assert.equal(fixture.writes[0][1].conclusion, "failure");
  }
});
test("Bun y otros archivos de descubrimiento de pruebas requieren revisión especial", async () => {
  for (const filename of [
    "bunfig.toml",
    "apps/web/vitest.config.ts",
    "jest.config.js",
    "tests/conftest.py",
  ]) {
    const fixture = apiFixture();
    fixture.args.github.rest.pulls.listFiles = async () => [{ filename }];
    await policy.reviewPR(fixture.args, 2);
    assert.equal(fixture.writes[0][1].conclusion, "failure", filename);
  }
});
