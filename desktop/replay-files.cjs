const fs = require("node:fs");
const path = require("node:path");

const REPLAY_FILE_PATTERN = /^(\d{8,12})\.dem(?:\.bz2)?$/i;

function replayIdentity(fileName) {
  const match = REPLAY_FILE_PATTERN.exec(String(fileName || ""));
  return match ? { matchId: match[1], compressed: /\.bz2$/i.test(fileName) } : null;
}

function scanReplayDirectory(directory) {
  if (typeof directory !== "string" || !directory.trim()) {
    throw new Error("Replay 目录不能为空");
  }
  const root = path.resolve(directory);
  if (!fs.statSync(root).isDirectory()) throw new Error("Replay 路径不是文件夹");

  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && replayIdentity(entry.name))
    .map((entry) => {
      const filePath = path.join(root, entry.name);
      const stat = fs.statSync(filePath);
      return {
        matchId: replayIdentity(entry.name).matchId,
        fileName: entry.name,
        filePath,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
    })
    .sort((left, right) => Date.parse(right.modifiedAt) - Date.parse(left.modifiedAt));
}

module.exports = {
  REPLAY_FILE_PATTERN,
  replayIdentity,
  scanReplayDirectory,
};
