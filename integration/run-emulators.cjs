const { spawnSync } = require("node:child_process");
const { existsSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { randomBytes } = require("node:crypto");
const secretFile = resolve(__dirname, "../functions/.secret.local");
if (!existsSync(secretFile)) {
  writeFileSync(
    secretFile,
    `VERIFICATION_SECRET=${randomBytes(32).toString("hex")}\n`,
    { flag: "wx" },
  );
}
const run = spawnSync(
  process.execPath,
  [
    require.resolve("firebase-tools/lib/bin/firebase.js"),
    "emulators:exec",
    "--config",
    "firebase.integration.json",
    "--project",
    "demo-settle",
    "--only",
    "auth,firestore,functions",
    "node integration/callable.cjs",
  ],
  {
    stdio: "inherit",
    cwd: resolve(__dirname, ".."),
    env: {
      ...process.env,
      FUNCTIONS_DISCOVERY_TIMEOUT:
        process.env.FUNCTIONS_DISCOVERY_TIMEOUT || "60",
    },
  },
);
if (run.error) console.error(run.error);
process.exitCode = run.status ?? 1;
