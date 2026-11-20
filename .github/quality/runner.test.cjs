const { test } = require("node:test");
const assert = require("node:assert/strict");
const { skipCount, noTests } = require("./run-project.cjs");
test("detecta omisiones de Bun, pytest, Jest y Node sin confundir cero", () => {
  for (const log of ["33 skip", "1 skipped", "Test Suites: 2 skipped", "# skipped 3"])
    assert.ok(skipCount(log) > 0);
  assert.equal(skipCount("385 pass\n0 skip\n# skipped 0"), 0);
});
test("cero pruebas no es una suite de regresión aprobada", () => {
  for (const log of ["No tests found", "# tests 0", "0 pass", "collected 0 items"])
    assert.equal(noTests(log), true);
  assert.equal(noTests("385 pass\n0 fail"), false);
});

test("un comando vacío o unittest sin pruebas nunca certifica regresión", () => {
  const { positiveTests, noTests, skipCount } = require("./run-project.cjs");
  assert.equal(positiveTests("nothing executed"), false);
  assert.equal(noTests("Ran 0 tests in 0.00s OK"), true);
  assert.equal(skipCount("OK (skipped=3)"), 3);
  for (const log of [
    "# tests 22",
    "22 passed in 0.5s",
    " 22 pass",
    "Tests: 2 passed, 2 total",
    "Ran 7 tests in 0.01s",
  ])
    assert.equal(positiveTests(log), true, log);
});

test("una prueba excluida de pytest tampoco cuenta como regresión completa", () =>
  assert.equal(require("./run-project.cjs").skipCount("1211 passed, 1 deselected"), 1));

test("reconoce el resumen real de Node24 en formato spec", () =>
  assert.equal(require("./run-project.cjs").positiveTests("ℹ tests 6\nℹ pass 6\nℹ fail 0"), true));

test("reproduce omisiones y pendientes con el reporter real de Node", () => {
  const fs = require("node:fs"),
    os = require("node:os"),
    path = require("node:path"),
    { spawnSync } = require("node:child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quality-node-spec-"));
  try {
    const file = path.join(dir, "test.cjs");
    fs.writeFileSync(
      file,
      "const {test}=require('node:test');test('pasa',()=>{});test.skip('omitida',()=>{});test.todo('pendiente');",
    );
    const childEnv = { ...process.env };
    delete childEnv.NODE_TEST_CONTEXT;
    const run = spawnSync(
      process.versions.bun ? "node" : process.execPath,
      ["--test", "--test-reporter=spec", file],
      {
        encoding: "utf8",
        env: childEnv,
      },
    );
    assert.equal(run.status, 0);
    assert.ok(
      require("./run-project.cjs").skipCount(run.stdout + run.stderr) > 0,
      run.stdout + run.stderr,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
