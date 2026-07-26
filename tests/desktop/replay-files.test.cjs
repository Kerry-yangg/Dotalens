const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { replayIdentity, scanReplayDirectory } = require("../../desktop/replay-files.cjs");

test("recognizes only Dota Replay names containing a match ID", () => {
  assert.deepEqual(replayIdentity("8909845275.dem"), { matchId: "8909845275", compressed: false });
  assert.deepEqual(replayIdentity("8909845275.dem.bz2"), { matchId: "8909845275", compressed: true });
  assert.equal(replayIdentity("notes.dem"), null);
  assert.equal(replayIdentity("8909845275.json"), null);
});

test("rejects an empty Replay directory instead of scanning the process workspace", () => {
  assert.throws(() => scanReplayDirectory(""), /Replay 目录不能为空/);
});

test("scans a selected directory without traversing nested or unrelated files", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dota-lens-replays-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "8909845275.dem"), "PBDEMS2");
  fs.writeFileSync(path.join(root, "readme.txt"), "ignore");
  fs.mkdirSync(path.join(root, "nested"));
  fs.writeFileSync(path.join(root, "nested", "8900000000.dem"), "PBDEMS2");

  const results = scanReplayDirectory(root);

  assert.equal(results.length, 1);
  assert.equal(results[0].matchId, "8909845275");
  assert.equal(results[0].fileName, "8909845275.dem");
  assert.equal(results[0].size, 7);
  assert.equal(results[0].filePath, path.join(root, "8909845275.dem"));
});
