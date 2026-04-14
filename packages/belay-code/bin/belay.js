#!/usr/bin/env node

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const distDir = path.join(__dirname, "..", "dist");

// ── Helpers ──────────────────────────────────────────────────────────

function walk(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

function findBinary() {
  if (!fs.existsSync(distDir)) return null;

  const platform = process.platform;
  const files = walk(distDir);

  if (platform === "win32") {
    return files.find((f) => path.basename(f) === "Belay.exe") || null;
  }

  if (platform === "darwin") {
    return (
      files.find((f) => /Belay\.app\/Contents\/MacOS\/Belay$/.test(f)) || null
    );
  }

  if (platform === "linux") {
    return (
      files.find((f) => {
        const base = path.basename(f);
        return base === "belay" || base === "Belay";
      }) || null
    );
  }

  return null;
}

// ── --version ────────────────────────────────────────────────────────

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  try {
    const { version } = JSON.parse(
      fs.readFileSync(path.join(distDir, ".version"), "utf8"),
    );
    console.log(`belay ${version}`);
  } catch {
    console.log("belay (version unknown)");
  }
  process.exit(0);
}

// ── Launch ───────────────────────────────────────────────────────────

const binary = findBinary();

if (!binary) {
  console.error("Belay is not installed. Download from:");
  console.error("  https://github.com/belay-codes/belay/releases");
  console.error("Or install via npm:");
  console.error("  npm install -g belay-code");
  process.exit(1);
}

const child = spawn(binary, process.argv.slice(2), {
  stdio: "ignore",
  detached: true,
});

child.on("error", (err) => {
  console.error("Failed to start Belay:", err.message);
  process.exit(1);
});

child.on("spawn", () => {
  child.unref();
});
