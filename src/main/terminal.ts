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

export class TerminalManager {
  private instances: Map<string, TerminalInstance> = new Map();
  private mainWindow: BrowserWindow | null = null;

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  spawn(id: string, cwd?: string): TerminalInstance {
    const platform = os.platform();
    let shell: string;

    if (platform === "win32") {
      shell = process.env.COMSPEC || "cmd.exe";
    } else if (platform === "darwin") {
      shell = "/bin/zsh";
      // Fallback to bash if zsh doesn't exist
      if (!existsSync(shell)) {
        shell = "/bin/bash";
      }
    } else {
      shell = "/bin/bash";
    }

    const workingDir = cwd || os.homedir();
    const name = path.basename(shell);

    const ptyProcess = pty.spawn(shell, [], {
      name,
      cwd: workingDir,
      env: process.env as Record<string, string>,
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
