import { spawnSync } from "node:child_process";

export function getExecutableName(command, platform = process.platform) {
  if (platform === "win32" && (command === "npm" || command === "npx")) {
    return `${command}.cmd`;
  }

  return command;
}

export function getCommandLookup(command, platform = process.platform) {
  if (platform === "win32") {
    return {
      command: "where.exe",
      args: [command],
    };
  }

  return {
    command: "which",
    args: [command],
  };
}

export function commandExists(command, options = {}) {
  const { platform = process.platform, spawnSyncImpl = spawnSync } = options;
  const lookup = getCommandLookup(command, platform);
  const result = spawnSyncImpl(lookup.command, lookup.args, {
    stdio: "ignore",
  });

  return result.status === 0;
}

export function runChecked(command, args, options = {}) {
  const {
    cwd,
    platform = process.platform,
    spawnSyncImpl = spawnSync,
    stdio = "inherit",
    allowFailure = false,
  } = options;
  const executable = getExecutableName(command, platform);
  const result = spawnSyncImpl(executable, args, {
    cwd,
    shell: platform === "win32" && executable.endsWith(".cmd"),
    stdio,
  });

  if (result.error) {
    throw result.error;
  }

  if (!allowFailure && result.status !== 0) {
    const error = new Error(`${command} exited with code ${result.status ?? 1}`);
    error.exitCode = result.status ?? 1;
    throw error;
  }

  return result;
}
