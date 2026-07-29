const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const [
  ,
  ,
  pwshPath,
  scriptPath,
  portValue,
  dataDirectory,
  stdoutPath,
  stderrPath,
  buildParserValue,
] = process.argv;
const port = Number(portValue);

if (
  !pwshPath
  || !scriptPath
  || !dataDirectory
  || !Number.isInteger(port)
  || port < 1024
  || port > 65535
) {
  throw new Error(
    "Usage: node Start-DotaLensBackground.cjs <pwsh> <script> <port> <data> <stdout> <stderr> <build>",
  );
}

fs.mkdirSync(path.dirname(stdoutPath), { recursive: true });
const stdout = fs.openSync(stdoutPath, "a");
const stderr = fs.openSync(stderrPath, "a");
const args = [
  "-NoProfile",
  "-File",
  scriptPath,
  "-Foreground",
  "-FrontendPort",
  String(port),
  "-DataDirectory",
  dataDirectory,
];
if (buildParserValue === "true") args.push("-BuildParser");

const child = spawn(pwshPath, args, {
  cwd: path.dirname(path.dirname(scriptPath)),
  detached: true,
  windowsHide: true,
  stdio: ["ignore", stdout, stderr],
});

fs.closeSync(stdout);
fs.closeSync(stderr);
child.unref();
process.stdout.write(String(child.pid));
