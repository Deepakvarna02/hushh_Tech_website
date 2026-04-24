import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { commandExists, runChecked } from "./command-utils.mjs";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPORT_DIR = path.join(ROOT_DIR, "tmp", "ci");
const FULL_REPORT_PATH = path.join(REPORT_DIR, "eslint-full-report.json");
const ESLINT_ENTRYPOINT = path.join(ROOT_DIR, "node_modules", "eslint", "bin", "eslint.js");

export function getGovernedLintTargets() {
  return [
    "eslint.config.js",
    "vite.config.ts",
    "vitest.config.ts",
    "src/vite-env.d.ts",
    "scripts/ci/*.mjs",
    "scripts/generate-sitemap.js",
    "scripts/generate-robots.js",
  ];
}

export function getEslintCommandArgs(...args) {
  return [ESLINT_ENTRYPOINT, ...args];
}

export function createBashUnavailableMessage() {
  return "Skipping shell syntax checks because bash is unavailable on this platform. Linux CI still validates *.sh syntax.";
}

export function canRunBash(spawnSyncImpl, platform = process.platform) {
  if (!commandExists("bash", { platform, spawnSyncImpl })) {
    return false;
  }

  try {
    runChecked("bash", ["--version"], {
      platform,
      spawnSyncImpl,
      stdio: "ignore",
      allowFailure: false,
    });
    return true;
  } catch {
    return false;
  }
}

export function listShellScripts(rootDir, directories = ["scripts/ci", "scripts/security"]) {
  const scripts = [];

  for (const relativeDir of directories) {
    const absoluteDir = path.join(rootDir, relativeDir);

    if (!fs.existsSync(absoluteDir)) {
      continue;
    }

    const stack = [absoluteDir];
    while (stack.length > 0) {
      const currentDir = stack.pop();
      for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
        const absolutePath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          stack.push(absolutePath);
          continue;
        }

        if (entry.isFile() && absolutePath.endsWith(".sh")) {
          scripts.push(absolutePath);
        }
      }
    }
  }

  return scripts.sort();
}

export function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  console.log("Running hard-gated lint checks on governed surfaces...");
  runChecked("node", getEslintCommandArgs("--max-warnings=0", ...getGovernedLintTargets()), {
    cwd: ROOT_DIR,
  });

  if (canRunBash()) {
    console.log("Running shell syntax checks...");
    for (const scriptPath of listShellScripts(ROOT_DIR)) {
      runChecked("bash", ["-n", scriptPath], {
        cwd: ROOT_DIR,
      });
    }
  } else {
    console.log(createBashUnavailableMessage());
  }

  console.log("Capturing full repo lint report (report-only)...");
  const reportFileDescriptor = fs.openSync(FULL_REPORT_PATH, "w");
  let result;
  try {
    result = runChecked("node", getEslintCommandArgs(".", "--format", "json"), {
      cwd: ROOT_DIR,
      stdio: ["ignore", reportFileDescriptor, "inherit"],
      allowFailure: true,
    });
  } finally {
    fs.closeSync(reportFileDescriptor);
  }

  if (result.status !== 0) {
    console.log(`Full repo lint violations captured in ${path.relative(ROOT_DIR, FULL_REPORT_PATH)}`);
  }
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(error.exitCode ?? 1);
  }
}
