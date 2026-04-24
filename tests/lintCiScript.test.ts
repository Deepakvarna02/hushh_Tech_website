import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  canRunBash,
  createBashUnavailableMessage,
  getEslintCommandArgs,
  getGovernedLintTargets,
  listShellScripts,
} from "../scripts/ci/lint-ci.mjs";
import {
  createMissingGitleaksMessage,
  getGitleaksArgs,
} from "../scripts/security/run-gitleaks.mjs";

const tempDirs = [];

describe("lint CI script helpers", () => {
  afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("keeps governed lint targets focused on contributor-facing files", () => {
    expect(getGovernedLintTargets()).toEqual([
      "eslint.config.js",
      "vite.config.ts",
      "vitest.config.ts",
      "src/vite-env.d.ts",
      "scripts/ci/*.mjs",
      "scripts/generate-sitemap.js",
      "scripts/generate-robots.js",
    ]);
  });

  it("builds eslint invocations through the local Node entrypoint", () => {
    const args = getEslintCommandArgs("--max-warnings=0", "eslint.config.js");

    expect(args.at(0)).toContain(path.join("node_modules", "eslint", "bin", "eslint.js"));
    expect(args.slice(1)).toEqual(["--max-warnings=0", "eslint.config.js"]);
  });

  it("finds shell scripts recursively in CI and security directories", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "hushh-lint-ci-"));
    tempDirs.push(rootDir);

    fs.mkdirSync(path.join(rootDir, "scripts", "ci", "nested"), { recursive: true });
    fs.mkdirSync(path.join(rootDir, "scripts", "security"), { recursive: true });
    fs.writeFileSync(path.join(rootDir, "scripts", "ci", "check.sh"), "#!/usr/bin/env bash\n");
    fs.writeFileSync(
      path.join(rootDir, "scripts", "ci", "nested", "child.sh"),
      "#!/usr/bin/env bash\n"
    );
    fs.writeFileSync(
      path.join(rootDir, "scripts", "security", "scan.sh"),
      "#!/usr/bin/env bash\n"
    );
    fs.writeFileSync(path.join(rootDir, "scripts", "security", "notes.txt"), "ignore me");

    expect(listShellScripts(rootDir)).toEqual([
      path.join(rootDir, "scripts", "ci", "check.sh"),
      path.join(rootDir, "scripts", "ci", "nested", "child.sh"),
      path.join(rootDir, "scripts", "security", "scan.sh"),
    ]);
  });

  it("explains why shell syntax checks can be skipped locally", () => {
    expect(createBashUnavailableMessage()).toContain("Linux CI still validates *.sh syntax");
  });

  it("treats bash as unavailable when version checks cannot run", () => {
    const spawnSyncImpl = ((command, args) => {
      if (command === "which") {
        return { status: 0 };
      }

      if (command === "bash") {
        return { status: 1 };
      }

      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    }) as typeof import("node:child_process").spawnSync;

    expect(canRunBash(spawnSyncImpl, "linux")).toBe(false);
  });

  it("keeps the gitleaks CLI arguments stable", () => {
    expect(getGitleaksArgs()).toEqual([
      "dir",
      ".",
      "--config",
      ".gitleaks.toml",
      "--redact",
      "--no-banner",
      "--max-target-megabytes",
      "10",
    ]);
  });

  it("tells contributors how to recover when gitleaks is missing", () => {
    expect(createMissingGitleaksMessage()).toContain("npm run security:gitleaks");
  });
});
