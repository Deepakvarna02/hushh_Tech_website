import { describe, expect, it, vi } from "vitest";

import {
  commandExists,
  getCommandLookup,
  getExecutableName,
  runChecked,
} from "../scripts/ci/command-utils.mjs";

describe("command utils", () => {
  it("uses cmd shims for npm-style commands on Windows", () => {
    expect(getExecutableName("npm", "win32")).toBe("npm.cmd");
    expect(getExecutableName("npx", "win32")).toBe("npx.cmd");
    expect(getExecutableName("bash", "win32")).toBe("bash");
  });

  it("uses platform-appropriate command lookup tools", () => {
    expect(getCommandLookup("bash", "win32")).toEqual({
      command: "where.exe",
      args: ["bash"],
    });
    expect(getCommandLookup("bash", "linux")).toEqual({
      command: "which",
      args: ["bash"],
    });
  });

  it("detects command availability from the lookup exit code", () => {
    const spawnSyncImpl = vi.fn(() => ({ status: 0 }));

    expect(commandExists("bash", { platform: "linux", spawnSyncImpl })).toBe(true);
    expect(spawnSyncImpl).toHaveBeenCalledWith("which", ["bash"], {
      stdio: "ignore",
    });
  });

  it("throws when a required command exits unsuccessfully", () => {
    expect(() =>
      runChecked("npx", ["eslint"], {
        platform: "linux",
        spawnSyncImpl: () => ({ status: 2 }),
      })
    ).toThrow("npx exited with code 2");
  });
});
