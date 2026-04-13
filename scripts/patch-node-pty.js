/**
 * postinstall script: patch node-pty and 7za for Electron packaging
 *
 * 1. Removes `SpectreMitigation` from node-pty's binding.gyp and
 *    deps/winpty/src/winpty.gyp so @electron/rebuild can compile without
 *    requiring Spectre-mitigated libraries from Visual Studio.
 *
 * 2. Installs a 7za.exe wrapper that maps exit code 2 (warnings / symlink
 *    creation failures) to 0. This is needed because electron-builder's
 *    app-builder extracts winCodeSign with `-snld`, which fails on Windows
 *    without Developer Mode or admin privileges.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const rootDir = path.join(__dirname, "..");
const nodeModulesDir = path.join(rootDir, "node_modules");

// ── 1. Patch node-pty binding files ──────────────────────────────────

const nodePtyDir = path.join(nodeModulesDir, "node-pty");

const gypTargets = [
  path.join(nodePtyDir, "binding.gyp"),
  path.join(nodePtyDir, "deps", "winpty", "src", "winpty.gyp"),
];

for (const filePath of gypTargets) {
  if (!fs.existsSync(filePath)) {
    console.log(
      `[patch-node-pty] ${path.basename(filePath)} not found, skipping.`
    );
    continue;
  }

  let content = fs.readFileSync(filePath, "utf8");

  if (!content.includes("SpectreMitigation")) {
    console.log(`[patch-node-pty] ${path.basename(filePath)} already patched.`);
    continue;
  }

  content = content.replace(
    /'msvs_configuration_attributes':\s*\{\s*'SpectreMitigation':\s*'Spectre'\s*\}/g,
    "'msvs_configuration_attributes': {}"
  );

  fs.writeFileSync(filePath, content, "utf8");
  console.log(
    `[patch-node-pty] Removed SpectreMitigation from ${path.basename(filePath)}.`
  );
}

// ── 2. Install 7za.exe wrapper ───────────────────────────────────────

const sevenZipDir = path.join(nodeModulesDir, "7zip-bin", "win", "x64");
const realExe = path.join(sevenZipDir, "7za-real.exe");
const currentExe = path.join(sevenZipDir, "7za.exe");

if (!fs.existsSync(sevenZipDir)) {
  console.log("[patch-node-pty] 7zip-bin win/x64 directory not found, skipping 7za wrapper.");
} else {
  // Determine whether the wrapper is already installed
  let needsWrapper = false;

  if (fs.existsSync(realExe)) {
    // 7za-real.exe exists — wrapper was already installed
    console.log("[patch-node-pty] 7za wrapper already installed.");
  } else if (!fs.existsSync(currentExe)) {
    console.log("[patch-node-pty] 7za.exe not found, skipping wrapper.");
  } else {
    // Check if the current exe is already our wrapper (small .NET assembly)
    const stat = fs.statSync(currentExe);
    if (stat.size < 50000) {
      console.log("[patch-node-pty] 7za wrapper already in place.");
    } else {
      needsWrapper = true;
    }
  }

  if (needsWrapper) {
    // Rename the real 7za.exe
    fs.renameSync(currentExe, realExe);
    console.log("[patch-node-pty] Renamed 7za.exe → 7za-real.exe");

    // Compile the wrapper using PowerShell / csc
    const wrapperSource = [
      "using System;",
      "using System.Diagnostics;",
      "class Program {",
      "  static int Main(string[] args) {",
      "    var dir = System.IO.Path.GetDirectoryName(System.Reflection.Assembly.GetEntryAssembly().Location);",
      "    var real = System.IO.Path.Combine(dir, \"7za-real.exe\");",
      "    var psi = new ProcessStartInfo {",
      "      FileName = real,",
      "      Arguments = string.Join(\" \", args),",
      "      UseShellExecute = false,",
      "    };",
      "    var p = Process.Start(psi);",
      "    p.WaitForExit();",
      "    // Exit code 2 = warnings (e.g. symlink creation failed) — treat as success",
      "    return p.ExitCode == 2 ? 0 : p.ExitCode;",
      "  }",
      "}",
    ].join("\n");

    const csFile = path.join(sevenZipDir, "_wrapper.cs");
    fs.writeFileSync(csFile, wrapperSource, "utf8");

    try {
      execSync(
        `powershell.exe -Command "Add-Type -OutputAssembly '${currentExe}' -OutputType ConsoleApplication -TypeDefinition (Get-Content -Raw '${csFile}')"`,
        { stdio: "pipe" }
      );
      console.log("[patch-node-pty] Installed 7za.exe wrapper (exit-code-2 → 0).");
    } catch (err) {
      // If compilation fails, restore the original exe
      console.error("[patch-node-pty] Failed to compile wrapper, restoring original 7za.exe.");
      if (fs.existsSync(currentExe)) fs.unlinkSync(currentExe);
      fs.renameSync(realExe, currentExe);
    } finally {
      // Clean up temp source file
      if (fs.existsSync(csFile)) fs.unlinkSync(csFile);
    }
  }
}
