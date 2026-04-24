import path from "node:path";
import { fileURLToPath } from "node:url";

import { commandExists, runChecked } from "../ci/command-utils.mjs";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function createMissingGitleaksMessage() {
  return [
    "gitleaks is not installed.",
    "Install it first, then re-run: npm run security:gitleaks",
  ].join("\n");
}

export function getGitleaksArgs() {
  return ["dir", ".", "--config", ".gitleaks.toml", "--redact", "--no-banner", "--max-target-megabytes", "10"];
}

export function main() {
  if (!commandExists("gitleaks")) {
    console.error(createMissingGitleaksMessage());
    process.exit(1);
  }

  runChecked("gitleaks", getGitleaksArgs(), {
    cwd: ROOT_DIR,
  });
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main();
}
