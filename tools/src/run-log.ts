/**
 * Run log: record each Dafny `lsc check` / `lsc regen` run in
 * `.lemmascript/runs.jsonl`, with a snapshot of the source (DESIGN_RUN_LOG.md).
 * Logging must never change lsc's output or exit code, so every filesystem
 * step is best-effort and swallows its own errors.
 */

import { createHash } from "crypto";
import path from "path";
import { findUp } from "./config.js";

export interface MemberResults {
  passed: string[];
  failed: string[];
}

/**
 * Parse Dafny's `--log-format text` file. Each member gets one entry per
 * check (`correctness`, `well-formedness`); it passes only if every check's
 * outcome is `Correct`.
 */
export function parseTextLog(text: string): MemberResults {
  const seen = new Set<string>();
  const failed = new Set<string>();
  for (const m of text.matchAll(/^Results for (.+?) \([a-z-]+\)\r?\n\s+Overall outcome: (\S+)/gm)) {
    seen.add(m[1]);
    if (m[2] !== "Correct") failed.add(m[1]);
  }
  return {
    passed: [...seen].filter(name => !failed.has(name)).sort(),
    failed: [...failed].sort(),
  };
}

/** First 12 hex characters of the SHA-256 of `text`. */
export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

/** A filtered Dafny run verifies only some members, so absences mean nothing. */
export function isPartialRun(extraFlags: string | undefined): boolean {
  return /--filter-(symbol|position)\b/.test(extraFlags ?? "");
}

/**
 * `LSC_RUN_LOG=false` turns logging off for one run; `true` or unset leaves it
 * to the config. Like lemmascript.json, any other value is an error.
 */
export function runLogEnabled(option: boolean, env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.LSC_RUN_LOG;
  if (value === undefined || value === "" || value === "true") return option;
  if (value === "false") return false;
  throw new Error(`LSC_RUN_LOG must be true or false (got ${JSON.stringify(value)})`);
}

/** The selected lemmascript.json's directory, else the source's git root, else cwd. */
export function resolveLogDir(sourcePath: string, configFile: string | null): string {
  if (configFile) return path.dirname(path.resolve(configFile));
  const git = findUp(".git", sourcePath);
  return git ? path.dirname(git) : process.cwd();
}
