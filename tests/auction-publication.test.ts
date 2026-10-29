import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

test("publication persists consecutive failures, retains snapshots, and resets after recovery", () => {
  const root = mkdtempSync(join(tmpdir(), "auction-publication-"));
  const remote = join(root, "remote.git");
  const data = join(root, "data");
  const candidate = join(root, "candidate.json");
  const output = join(root, "output");
  const script = resolve("scripts/publish-auction-snapshot.sh");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    git("init", "--bare", remote);
    git("init", data);
    git("-C", data, "config", "user.name", "Test");
    git("-C", data, "config", "user.email", "test@example.com");
    git("-C", data, "remote", "add", "origin", remote);
    const snapshot = join(data, "auction-prices.json");
    writeFileSync(snapshot, '{"sourceUpdatedAt":123}\n');
    git("-C", data, "add", ".");
    git("-C", data, "commit", "-m", "Initial snapshot");
    writeFileSync(candidate, '{"sourceUpdatedAt":456}\n');
    const run = (result: string, count: number, status: number) => {
      const child = spawnSync("bash", [script, data, candidate, result], {
        env: { ...process.env, GITHUB_OUTPUT: output }, encoding: "utf8",
      });
      assert.equal(child.status, status, child.stdout + child.stderr);
      assert.equal(readFileSync(join(data, "consecutive-failures.txt"), "utf8"), `${count}\n`);
      assert.equal(git("--git-dir", remote, "show", "auction-data:consecutive-failures.txt").toString(), `${count}\n`);
    };
    run("failure", 1, 0);
    run("failure", 2, 0);
    run("failure", 3, 1);
    run("failure", 4, 1);
    assert.equal(readFileSync(snapshot, "utf8"), '{"sourceUpdatedAt":123}\n');
    run("success", 0, 0);
    assert.equal(readFileSync(snapshot, "utf8"), readFileSync(candidate, "utf8"));
    run("failure", 1, 0);
    run("success", 0, 0);
    // An unchanged successful report must not cause an empty-commit failure.
    run("success", 0, 0);
    rmSync(snapshot);
    run("failure", 1, 1);
    // A publication error must remain a failure even below the collection threshold.
    git("-C", data, "remote", "set-url", "origin", join(root, "missing.git"));
    const rejected = spawnSync("bash", [script, data, candidate, "success"], {
      env: { ...process.env, GITHUB_OUTPUT: output },
    });
    assert.notEqual(rejected.status, 0);
    assert.equal(git("--git-dir", remote, "show", "auction-data:consecutive-failures.txt").toString(), "1\n");
    writeFileSync(join(data, "consecutive-failures.txt"), "invalid\n");
    assert.equal(spawnSync("bash", [script, data, candidate, "failure"], {
      env: { ...process.env, GITHUB_OUTPUT: output },
    }).status, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
