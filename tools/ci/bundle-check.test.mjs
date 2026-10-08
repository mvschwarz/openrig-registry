import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { checkSubmission, checkSubmissions, report } from "./bundle-check.mjs";
import { readYaml } from "../lib/load.mjs";

const SPEC = `version: "0.2"
name: validator-fixture
docs: [{path: README.md}]
pods:
  - id: infra
    label: Infrastructure
    members:
      - { id: observer, runtime: terminal, agent_ref: "builtin:terminal", profile: none, cwd: "." }
    edges: []
edges: []
`;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "submission-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  fs.mkdirSync(source);
  const git = (...args) => execFileSync("git", args, { cwd: source, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.invalid");
  fs.writeFileSync(path.join(source, "rig.yaml"), SPEC);
  fs.writeFileSync(path.join(source, "README.md"), "# Fixture team\n");
  // These would leave a receipt if anything installs dependencies or launches the source.
  const marker = path.join(root, "executed");
  const command = `node -e 'require("fs").writeFileSync(${JSON.stringify(marker)},"ran")'`;
  fs.writeFileSync(path.join(source, "package.json"), JSON.stringify({ scripts: { preinstall: command, postinstall: command, start: command } }));
  git("add", "."); git("commit", "-qm", "Valid bundle");
  const commit = git("rev-parse", "HEAD");
  git("tag", "valid");
  const saved = { ...process.env };
  // Only transport is substituted; production still parses a real, schema-valid GitHub submission.
  process.env.GIT_CONFIG_COUNT = "2";
  process.env.GIT_CONFIG_KEY_0 = `url.file://${source}.insteadOf`;
  process.env.GIT_CONFIG_VALUE_0 = "https://github.com/example/team";
  process.env.GIT_CONFIG_KEY_1 = "protocol.file.allow";
  process.env.GIT_CONFIG_VALUE_1 = "always";
  t.after(() => { for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]; Object.assign(process.env, saved); });
  const registry = path.join(root, "registry");
  fs.mkdirSync(path.join(registry, "registry", "submissions"), { recursive: true });
  const submission = { repository: "https://github.com/example/team", folder: ".", ref: "main" };
  const writeSubmission = (value = submission) => fs.writeFileSync(path.join(registry, "registry/submissions/team.yaml"), JSON.stringify(value));
  const writeEntry = (slug, { ref = commit, status = "listed" } = {}) => {
    const entry = readYaml(new URL("../test/fixtures/registry-valid.yaml", import.meta.url));
    Object.assign(entry, { slug, name: "A display title", status });
    entry.source = { repository: submission.repository, folder: ".", resolvedCommit: ref };
    if (status === "withdrawn") entry.withdrawnOn = "2026-10-08";
    fs.writeFileSync(path.join(registry, "registry", `${slug}.yaml`), JSON.stringify(entry));
  };
  return { root, source, git, commit, marker, registry, submission, writeSubmission, writeEntry };
}

test("a colliding submission passes with a maintainer notice in output and summary", t => {
  const f = fixture(t); f.writeEntry("existing"); f.writeSubmission();
  const results = checkSubmissions(f.registry);
  const submitted = results.find(r => r.file === "registry/submissions/team.yaml");
  assert.equal(submitted.status, 0, JSON.stringify(results));
  assert.match(submitted.notice, /validator-fixture.*registry\/submissions\/team.yaml.*registry\/existing.yaml/);
  assert.match(submitted.notice, /Installing both listings on one machine/);
  assert.match(submitted.notice, /For this submission, choose a different name/);
  const established = results.find(r => r.file === "registry/existing.yaml");
  assert.doesNotMatch(established.notice, /choose a different name/);
  const output = []; const summary = path.join(f.root, "clash-summary.md");
  assert.equal(report(results, { log: s => output.push(s), summary, actions: true }), 0);
  assert.equal(output.filter(line => line.startsWith("::notice")).length, 2);
  assert.ok(output.every(line => !line.startsWith("::error")));
  assert.match(fs.readFileSync(summary, "utf8"), /Maintainer review: installed-name clashes/);
  assert.match(fs.readFileSync(summary, "utf8"), /Installing both listings on one machine/);
  assert.equal(fs.existsSync(f.marker), false);
});

test("two complete entries with the same installed rig name pass with informational notices", t => {
  const f = fixture(t); f.writeEntry("first"); f.writeEntry("second");
  const results = checkSubmissions(f.registry);
  assert.equal(results.length, 2);
  assert.ok(results.every(r => r.status === 0 && /validator-fixture/.test(r.notice)), JSON.stringify(results));
  assert.ok(results.every(r => !/choose a different name/.test(r.notice)));
  assert.equal(report(results, { log() {}, summary: null, actions: false }), 0);
  assert.equal(fs.existsSync(f.marker), false);
});

test("names come from the pinned rig, not a display title or moving branch", t => {
  const f = fixture(t); f.writeEntry("first");
  fs.writeFileSync(path.join(f.source, "rig.yaml"), SPEC.replace("name: validator-fixture", "name: other-team"));
  f.git("add", "."); f.git("commit", "-qm", "Another installed name");
  f.writeEntry("second", { ref: f.git("rev-parse", "HEAD") });
  const results = checkSubmissions(f.registry);
  assert.deepEqual(results.map(r => r.rigName), ["validator-fixture", "other-team"]);
  assert.ok(results.every(r => r.status === 0), JSON.stringify(results));
  assert.ok(results.every(r => !r.notice));
});

test("an update of the same listing and a withdrawn name do not collide", t => {
  const f = fixture(t); f.writeEntry("team"); f.writeEntry("retired", { status: "withdrawn" }); f.writeSubmission();
  const results = checkSubmissions(f.registry);
  assert.equal(results.length, 2);
  assert.ok(results.every(r => r.status === 0), JSON.stringify(results));
  assert.ok(results.every(r => r.rigName === "validator-fixture"));
  assert.ok(results.every(r => !r.notice));
});

test("a submitted branch reaches the real CLI, preserves not_checked, and executes no source scripts", t => {
  const f = fixture(t); f.writeSubmission();
  const results = checkSubmissions(f.registry);
  assert.equal(results.length, 1);
  assert.equal(results[0].status, 0, JSON.stringify(results));
  assert.equal(results[0].resolvedCommit, f.commit);
  assert.ok(results[0].result.checks.some(c => c.ruleId === "pod_aware_rig" && c.status === "pass"));
  assert.ok(results[0].result.checks.some(c => c.ruleId === "embedded_secrets" && c.status === "not_checked"));
  assert.equal(fs.existsSync(f.marker), false);
  assert.equal(f.git("status", "--porcelain"), "");
});

test("a pinned commit and tag check those bytes even when the branch has become invalid", t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.source, "rig.yaml"), "not: a rig\n");
  f.git("add", "."); f.git("commit", "-qm", "Broken bundle");
  for (const ref of [f.commit, "valid"]) {
    const result = checkSubmission({ ...f.submission, ref });
    assert.equal(result.status, 0, JSON.stringify(result));
    assert.equal(result.resolvedCommit, f.commit);
  }
  const result = checkSubmission(f.submission);
  assert.equal(result.status, 1);
  assert.equal(result.resolvedCommit, f.git("rev-parse", "HEAD"));
  assert.ok(result.result.checks.some(c => c.ruleId === "pod_aware_rig" && c.status === "finding"));
  assert.equal(report([result], { log() {}, summary: null, actions: false }), 1);
});

test("invalid input, missing refs and escaping folder links fail instead of silently skipping validation", t => {
  const f = fixture(t);
  f.writeSubmission({ ...f.submission, repository: "file:///not-a-submission" });
  assert.equal(checkSubmissions(f.registry)[0].status, 1);
  assert.equal(checkSubmission({ ...f.submission, ref: "missing" }).status, 1);
  assert.equal(checkSubmission({ ...f.submission, ref: "--upload-pack=unexpected" }).status, 1);
  fs.symlinkSync(os.tmpdir(), path.join(f.source, "outside"));
  f.git("add", "."); f.git("commit", "-qm", "Outside folder");
  const result = checkSubmission({ ...f.submission, folder: "outside" });
  assert.equal(result.status, 1);
  assert.match(result.error, /outside the fetched repository/);
});

test("missing README is a real CLI finding; a missing validator is a distinct error", t => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.source, "README.md"));
  f.git("add", "."); f.git("commit", "-qm", "Missing README");
  const result = checkSubmission(f.submission);
  assert.equal(result.status, 1);
  assert.ok(result.result.checks.some(c => c.ruleId === "readme_in_docs" && c.status === "finding"));
  const failed = checkSubmission(f.submission, path.join(f.root, "no-validator"));
  assert.equal(failed.status, 1); assert.ok(failed.error); assert.equal(failed.result, undefined);
});

test("no submissions pass without fetching, and CI output quotes authored text", t => {
  const f = fixture(t);
  assert.deepEqual(checkSubmissions(f.registry), []);
  const output = []; const summary = path.join(f.root, "summary.md");
  const result = { file: "registry/submissions/team.yaml", status: 1, error: "bad\n::notice::forged\n```\n<script>" };
  assert.equal(report([result], { log: s => output.push(s), summary, actions: true }), 1);
  assert.equal(output.length, 2);
  assert.ok(output.every(line => !line.includes("\n")));
  assert.match(output[1], /%0A%3A%3Anotice/);
  assert.equal(fs.readFileSync(summary, "utf8").match(/```/g).length, 2);
  assert.doesNotMatch(fs.readFileSync(summary, "utf8"), /<script>/);
});

test("advisory output escapes authored text without hiding actual failures", t => {
  const f = fixture(t); const output = []; const summary = path.join(f.root, "notice-summary.md");
  const notice = { file: "registry/team.yaml", status: 0, notice: "clash\n::error::forged\n```\n<script>" };
  assert.equal(report([notice], { log: s => output.push(s), summary, actions: true }), 0);
  assert.ok(output.every(line => !line.includes("\n")));
  assert.match(output[1], /^::notice.*%0A%3A%3Aerror/);
  const text = fs.readFileSync(summary, "utf8");
  assert.equal(text.match(/```/g).length, 4);
  assert.doesNotMatch(text, /<script>/);
  assert.equal(report([notice, { file: "registry/submissions/bad.yaml", status: 1, error: "Source could not be read" }],
    { log() {}, summary: null, actions: false }), 1);
});
