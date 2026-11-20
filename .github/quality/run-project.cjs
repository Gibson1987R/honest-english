"use strict";
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
function skipCount(log) {
  const numbers = [];
  for (const match of log.matchAll(/\b(\d+)\s+(?:skip(?:ped)?|deselected|todo)\b/gi))
    numbers.push(Number(match[1]));
  for (const match of log.matchAll(/^(?:#|ℹ)\s*(?:skipped|todo)\s+(\d+)/gm))
    numbers.push(Number(match[1]));
  for (const match of log.matchAll(/skipped[=:]\s*(\d+)/gi)) numbers.push(Number(match[1]));
  return Math.max(0, ...numbers);
}
function noTests(log) {
  return /\bno tests found\b|^# tests 0\b|\b0 pass\b|collected 0 items|Ran 0 tests/i.test(log);
}
function positiveTests(log) {
  return /(?:^(?:#|ℹ) tests [1-9]\d*\b|\b[1-9]\d* passed\b|\b[1-9]\d* pass\b|Tests:\s+[^\n]*[1-9]\d* passed\b|Ran [1-9]\d* tests?\b)/im.test(
    log,
  );
}
function main() {
  const config = JSON.parse(fs.readFileSync(".github/quality/project.json", "utf8"));
  if (!Array.isArray(config.test_commands) || config.test_commands.length === 0) {
    console.error(
      "INCOMPLETO: este repositorio no tiene una suite de regresión automatizada configurada. Añadir pruebas y adaptar .github/quality/project.json; no se acepta por omisión.",
    );
    return 2;
  }
  let result = 0;
  for (const [stage, commands] of [
    ["preparación", config.setup_commands || []],
    ["comprobación", config.check_commands || []],
    ["regresión", config.test_commands],
  ]) {
    for (const command of commands) {
      if (
        !Array.isArray(command) ||
        !command.length ||
        !command.every((value) => typeof value === "string")
      )
        throw new Error(
          "Los comandos deben ser arrays de argumentos, sin interpolación de texto del PR.",
        );
      console.log(`Etapa: ${stage}; ejecutable: ${command[0]}`);
      const child = spawnSync(command[0], command.slice(1), {
        encoding: "utf8",
        timeout: 900000,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, CI: "true", NODE_ENV: "test" },
        shell: false,
      });
      const log = String(child.stdout || "") + String(child.stderr || "");
      process.stdout.write(log);
      if (child.status !== 0 || child.error) {
        result = 1;
        break;
      }
      if (stage === "regresión" && (skipCount(log) > 0 || noTests(log) || !positiveTests(log))) {
        console.error(
          "INCOMPLETO: la suite omitió pruebas, dejó pendientes o no descubrió pruebas; no se certifica regresión completa.",
        );
        result = 2;
      }
    }
    if (result) break;
  }
  fs.writeFileSync(
    ".quality-result.json",
    JSON.stringify({ exit_code: result, complete: result === 0 }),
  );
  return result;
}
module.exports = { skipCount, noTests, positiveTests };
if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
