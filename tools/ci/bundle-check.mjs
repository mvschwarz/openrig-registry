#!/usr/bin/env node
// Fetch source as data, then invoke the published validator. Never install or launch a submitted bundle.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadSubmissions, loadValidators } from "../lib/load.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const options = { encoding: "utf8", timeout: 120_000, maxBuffer: 2 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] };
const git = (cwd, args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
  ...options, cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
}).trim();

/** The caller supplies a schema-validated submission. Each fetch and validator gets its own temporary folder. */
export function checkSubmission(submission, rig = process.env.RIG_BIN || "rig") {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "openrig-bundle-check-"));
  const checkout = path.join(temp, "source");
  let resolvedCommit;
  try {
    fs.mkdirSync(checkout);
    // A ref names one branch, tag or commit, not a fetch refspec or an option.
    if (submission.ref.startsWith("-")) throw new Error("ref must be a branch, tag or commit");
    git(checkout, ["check-ref-format", "--allow-onelevel", submission.ref]);
    git(checkout, ["init", "--quiet"]);
    git(checkout, ["fetch", "--quiet", "--depth=1", "--no-tags", "--", submission.repository, submission.ref]);
    resolvedCommit = git(checkout, ["rev-parse", "--verify", "FETCH_HEAD^{commit}"]);
    git(checkout, ["checkout", "--quiet", "--detach", resolvedCommit]);
    const folder = fs.realpathSync(path.resolve(checkout, submission.folder));
    const relative = path.relative(fs.realpathSync(checkout), folder);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error("bundle folder resolves outside the fetched repository");
    }
    let stdout;
    let status = 0;
    try {
      stdout = execFileSync(rig, ["bundle", "check", folder, "--json"], {
        ...options, cwd: temp, env: { ...process.env, OPENRIG_HOME: path.join(temp, "home") },
      });
    } catch (error) {
      // Exit 1 is the CLI's normal findings result. Launch failures and timeouts are not validation results.
      if (error.status !== 1 || error.signal) throw error;
      stdout = String(error.stdout);
      status = 1;
    }
    const result = JSON.parse(stdout);
    if (result.standardVersion !== "openrig.bundle-standard/v1" || !Array.isArray(result.checks) || !result.checks.length ||
        result.checks.some(check => !["pass", "finding", "not_checked"].includes(check.status))) {
      throw new Error("validator did not return a bundle-standard result");
    }
    const findings = result.checks.filter(check => check.status === "finding").length;
    return { source: submission, resolvedCommit, status: status || (findings ? 1 : 0), result };
  } catch (error) {
    return { source: submission, ...(resolvedCommit ? { resolvedCommit } : {}), status: 1, error: error.message };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

export function checkSubmissions(root = ROOT) {
  const validators = loadValidators();
  if (validators.problems.length) throw new Error(validators.problems.join("; "));
  return loadSubmissions(root, validators).map(({ file, submission, problem }) => ({
    file, ...(problem ? { status: 1, error: problem } : checkSubmission(submission)),
  }));
}

// Neither annotation data nor a JSON code block may become workflow commands or Markdown supplied by a bundle.
const escapeAnnotation = text => String(text).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A").replaceAll(":", "%3A").replaceAll(",", "%2C");
export function report(results, { log = console.log, summary = process.env.GITHUB_STEP_SUMMARY, actions = process.env.GITHUB_ACTIONS === "true" } = {}) {
  for (const result of results) {
    log(JSON.stringify(result));
    if (actions) {
      const checks = result.result?.checks || [];
      const counts = `${checks.filter(c => c.status === "finding").length} finding(s), ${checks.filter(c => c.status === "not_checked").length} not checked`;
      const message = result.error || `${counts}; resolved commit ${result.resolvedCommit}. See the job summary for every rule.`;
      log(`::${result.status ? "error" : "notice"} file=${escapeAnnotation(result.file)},title=Bundle check::${escapeAnnotation(message)}`);
    }
  }
  if (!results.length) log("No submitted bundles to check.");
  if (summary) {
    const json = JSON.stringify(results, null, 2).replaceAll("`", "\\u0060").replaceAll("<", "\\u003c");
    fs.appendFileSync(summary, `## Submitted bundle checks\n\nValidator: @openrig/cli 0.6.6. Validation only; no bundle is installed or launched.\n\n${results.length ? "```json\n" + json + "\n```" : "No submitted bundles to check."}\n`);
  }
  return results.some(result => result.status !== 0) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = report(checkSubmissions());
}
