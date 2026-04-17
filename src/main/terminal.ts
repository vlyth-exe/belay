import * as pty from "node-pty";
import * as os from "os";
import * as path from "path";
import { BrowserWindow } from "electron";
import { existsSync } from "fs";

export interface TerminalInstance {
  id: string;
  pty: pty.IPty;
  cwd: string;
}

export interface SpawnOptions {
  /** Shell executable. Defaults to the platform default. */
  shell?: string;
  /** Arguments passed to the shell. */
  args?: string[];
  /** If true, spawn inside WSL (Windows only). */
  isWsl?: boolean;
  /** WSL distribution name (e.g. "Ubuntu"). Implies isWsl. */
  wslDistro?: string;
}

export class TerminalManager {
  private instances: Map<string, TerminalInstance> = new Map();
  private mainWindow: BrowserWindow | null = null;

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  spawn(
    id: string,
    cwd?: string,
    options?: SpawnOptions,
    cols?: number,
    rows?: number,
  ): TerminalInstance {
    const platform = os.platform();
    const isWindows = platform === "win32";
    const useWsl = options?.isWsl || !!options?.wslDistro;

    let shell: string;
    let spawnArgs: string[];

    if (options?.shell) {
      // User-defined profile
      shell = options.shell;
      spawnArgs = options.args ?? [];
    } else if (isWindows && useWsl) {
      // WSL default (no custom shell specified)
      shell = "wsl.exe";
      spawnArgs = [];
      if (options?.wslDistro) {
        spawnArgs.push("-d", options.wslDistro);
      }
      // Pass --cd with Linux path so WSL starts in the right directory.
      // We do NOT set cwd to a Linux path because node-pty (ConPTY)
      // expects a valid Windows path for its cwd option.
      if (cwd) {
        const linuxPath = cwd
          .replace(/\\/g, "/")
          .replace(
            /^([A-Za-z]):/,
            (_, letter: string) => `/mnt/${letter.toLowerCase()}`,
          );
        spawnArgs.push("--cd", linuxPath);
      }
    } else if (isWindows) {
      shell = process.env.COMSPEC || "cmd.exe";
      spawnArgs = [];
    } else if (platform === "darwin") {
      shell = "/bin/zsh";
      if (!existsSync(shell)) {
        shell = "/bin/bash";
      }
      spawnArgs = [];
    } else {
      shell = "/bin/bash";
      spawnArgs = [];
    }

    const workingDir = cwd || os.homedir();

    // node-pty on Windows expects a valid Windows path for cwd.
    // For WSL sessions the directory is set via --cd in spawnArgs instead.
    const effectiveCwd = workingDir;

    const name = path.basename(shell);

    const ptyProcess = pty.spawn(shell, spawnArgs, {
      name,
      cwd: effectiveCwd,
      env: process.env as Record<string, string>,
      cols: cols ?? 80,
      rows: rows ?? 24,
    });

    const instance: TerminalInstance = {
      id,
      pty: ptyProcess,
      cwd: workingDir,
    };

    ptyProcess.onData((data: string) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send("terminal:data", { id, data });
      }
    });

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send("terminal:exit", { id, exitCode });
      }
      this.instances.delete(id);
    });

    this.instances.set(id, instance);
    return instance;
  }

  write(id: string, data: string): void {
    const instance = this.instances.get(id);
    if (!instance) {
      return;
    }
    instance.pty.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    const instance = this.instances.get(id);
    if (!instance) {
      return;
    }
    instance.pty.resize(cols, rows);
  }

  kill(id: string): void {
    const instance = this.instances.get(id);
    if (!instance) {
      return;
    }
    instance.pty.kill();
    this.instances.delete(id);
  }

  killAll(): void {
    for (const instance of this.instances.values()) {
      instance.pty.kill();
    }
    this.instances.clear();
  }

  dispose(): void {
    this.killAll();
  }
}

export const terminalManager = new TerminalManager();
