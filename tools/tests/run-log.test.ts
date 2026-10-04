import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashText, isPartialRun, parseTextLog, resolveLogDir, runLogEnabled } from "../src/run-log.ts";

function tempDir(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "lsc-run-log-test-")));
}

// Trimmed from real Dafny 4.11 `--log-format text` output for a broken arraySum.
const TEXT_LOG = `
Results for sumTo (well-formedness)
  Overall outcome: Correct
  Overall time: 00:00:00.0240667

Results for arraySum (well-formedness)
  Overall outcome: Correct

Results for arraySum (correctness)
  Overall outcome: Errors
`;

test("parseTextLog lists each member once, failed if any check failed", () => {
  assert.deepEqual(parseTextLog(TEXT_LOG), { passed: ["sumTo"], failed: ["arraySum"] });
});

test("parseTextLog treats any outcome other than Correct as a failure", () => {
  const log = "Results for slow (correctness)\n  Overall outcome: TimedOut\n";
  assert.deepEqual(parseTextLog(log), { passed: [], failed: ["slow"] });
});

test("parseTextLog returns empty lists for a log with no results", () => {
  assert.deepEqual(parseTextLog(""), { passed: [], failed: [] });
});

test("hashText is a stable 12-character hex prefix", () => {
  assert.equal(hashText("abc"), "ba7816bf8f01");
  assert.match(hashText("anything"), /^[0-9a-f]{12}$/);
});

test("filtered Dafny runs are partial", () => {
  assert.equal(isPartialRun(undefined), false);
  assert.equal(isPartialRun("--isolate-assertions"), false);
  assert.equal(isPartialRun("--filter-symbol=foo"), true);
  assert.equal(isPartialRun("--isolate-assertions --filter-position=x.dfy:3"), true);
});

test("LSC_RUN_LOG=false turns logging off for one run; true or unset defers to config", () => {
  assert.equal(runLogEnabled(true, {}), true);
  assert.equal(runLogEnabled(false, {}), false);
  assert.equal(runLogEnabled(true, { LSC_RUN_LOG: "false" }), false);
  assert.equal(runLogEnabled(true, { LSC_RUN_LOG: "true" }), true);
  assert.equal(runLogEnabled(false, { LSC_RUN_LOG: "true" }), false);
  assert.equal(runLogEnabled(true, { LSC_RUN_LOG: "" }), true);
});

test("LSC_RUN_LOG accepts only true or false, like lemmascript.json", () => {
  for (const value of ["0", "1", "no", "FALSE"]) {
    assert.throws(() => runLogEnabled(true, { LSC_RUN_LOG: value }), /LSC_RUN_LOG must be true or false/);
  }
});

test("the log lives beside lemmascript.json, else at the git root, else in cwd", () => {
  const root = tempDir();
  try {
    mkdirSync(join(root, "repo", ".git"), { recursive: true });
    mkdirSync(join(root, "repo", "src"), { recursive: true });
    const source = join(root, "repo", "src", "a.ts");
    writeFileSync(source, "");
    const config = join(root, "repo", "src", "lemmascript.json");
    assert.equal(resolveLogDir(source, config), join(root, "repo", "src"));
    assert.equal(resolveLogDir(source, null), join(root, "repo"));
    const loose = join(root, "loose.ts");
    writeFileSync(loose, "");
    assert.equal(resolveLogDir(loose, null), process.cwd());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
