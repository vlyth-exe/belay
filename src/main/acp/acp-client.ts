import { ChildProcess, spawn, execSync } from "node:child_process";
import { ClientSideConnection, ndJsonStream } from "@agentclientprotocol/sdk";
import type {
  Client,
  ReadTextFileRequest,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
  WriteTextFileRequest,
} from "@agentclientprotocol/sdk";
import type { HarnessConfig } from "./harness-store";

// ── Types ──────────────────────────────────────────────────────────────

type UpdateCallback = (update: unknown) => void;
type PermissionCallback = (
  request: RequestPermissionRequest,
) => Promise<RequestPermissionResponse>;
type ErrorCallback = (error: { message: string; stderr: string }) => void;

// ── Helpers ────────────────────────────────────────────────────────────

export const isWindows = process.platform === "win32";

/**
 * Quote an argument for inclusion in a shell command string.
 * Wraps in double quotes if it contains spaces or shell metacharacters.
 */
function shellQuote(arg: string): string {
  if (/[ &|<>()^"%!';`$\\]/.test(arg) || arg.includes(" ")) {
    return `"${arg.replace(/"/g, '\\"')}"`;
  }
  return arg;
}

/**
 * Build a single command-line string from a command and its arguments.
 * Used on Windows with `shell: true` to avoid the Node.js DEP0190
 * deprecation warning about passing an args array with `shell: true`.
 */
function buildCommandLine(command: string, args: string[]): string {
  const parts = [command.includes(" ") ? `"${command}"` : command];
  for (const a of args) parts.push(shellQuote(a));
  return parts.join(" ");
}

/**
 * Extract the most relevant error line from a stderr dump.
 * Skips noise like `npm warn` and returns the last substantive line,
 * or `undefined` if nothing useful is found.
 */
function extractLastError(stderr: string): string | undefined {
  const lines = stderr
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Walk backwards to find the most specific error line,
  // skipping known noise prefixes.
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.startsWith("npm warn")) continue;
    return line;
  }

  return undefined;
}

/**
 * Convert a Windows path to a WSL-compatible path.
 * e.g. "D:\\Dev\\belay" → "/mnt/d/Dev/belay"
 */
export function windowsToWslPath(winPath: string): string {
  let path = winPath.replace(/\\/g, "/");
  path = path.replace(
    /^([A-Za-z]):/,
    (_, drive: string) => `/mnt/${drive.toLowerCase()}`,
  );
  return path;
}

// ── AcpClient ──────────────────────────────────────────────────────────

export class AcpClient {
  private process: ChildProcess | null = null;
  private connection: ClientSideConnection | null = null;
  private _sessionId: string | null = null;
  private _onUpdate: UpdateCallback | null = null;
  private _onPermissionRequest: PermissionCallback | null = null;
  private _onError: ErrorCallback | null = null;
  private _state: "disconnected" | "initializing" | "ready" | "error" =
    "disconnected";
  private _stateChangeCallback: ((state: string) => void) | null = null;
  private _stderrChunks: string[] = [];
  private _initReject: ((error: Error) => void) | null = null;

  get sessionId(): string | null {
    return this._sessionId;
  }

  get state(): string {
    return this._state;
  }

  set onUpdate(cb: UpdateCallback | null) {
    this._onUpdate = cb;
  }

  set onPermissionRequest(cb: PermissionCallback | null) {
    this._onPermissionRequest = cb;
  }

  set onError(cb: ErrorCallback | null) {
    this._onError = cb;
  }

  set onStateChange(cb: ((state: string) => void) | null) {
    this._stateChangeCallback = cb;
  }

  private setState(
    state: "disconnected" | "initializing" | "ready" | "error",
  ): void {
    this._state = state;
    this._stateChangeCallback?.(state);
  }

  // ── Connection ─────────────────────────────────────────────────────

  async connect(harness: HarnessConfig): Promise<void> {
    if (this.process || this.connection) {
      await this.disconnect();
    }

    this.setState("initializing");
    this._stderrChunks = [];

    try {
      const env = { ...process.env, ...harness.env };
      const cwd = harness.cwd || process.cwd();

      // ── Spawn agent subprocess ───────────────────────────────────
      //
      // Three spawn modes:
      //
      // 1. WSL (Windows + useWsl): Wraps the command through `wsl.exe`
      //    so Linux-only agents run inside Windows Subsystem for Linux.
      //    The cwd is converted to a WSL path (e.g. /mnt/c/...) and
      //    passed via `--cd`.  An optional `-d <distro>` selects the
      //    WSL distribution.
      //
      // 2. Native Windows: Commands like `npx` are actually `npx.cmd`
      //    batch files that require cmd.exe to interpret them.  We use
      //    `shell: true` but pass a **single command string** instead
      //    of an args array to avoid the Node.js DEP0190 deprecation
      //    warning.
      //
      // 3. Unix: The command is directly executable, so we spawn
      //    without a shell for clean process-tree management.

      if (isWindows && harness.useWsl) {
        // WSL mode — wrap through wsl.exe, using the Linux binary
        // command if available (falls back to the regular command).
        const wslCommand = harness.linuxCommand ?? harness.command;
        const wslCommandArgs = harness.linuxArgs ?? harness.args;
        const wslArgs: string[] = [];
        if (harness.wslDistro) {
          wslArgs.push("-d", harness.wslDistro);
        }
        wslArgs.push("--cd", windowsToWslPath(cwd));
        wslArgs.push("--", wslCommand, ...wslCommandArgs);
        console.log(
          `[ACP ${harness.name}] Spawning via WSL: wsl ${wslArgs.join(" ")}`,
        );
        this.process = spawn("wsl.exe", wslArgs, {
          env,
          stdio: ["pipe", "pipe", "pipe"],
        });
      } else if (isWindows) {
        const cmdLine = buildCommandLine(harness.command, harness.args);
        this.process = spawn(cmdLine, {
          cwd,
          env,
          stdio: ["pipe", "pipe", "pipe"],
          shell: true,
        });
      } else {
        this.process = spawn(harness.command, harness.args, {
          cwd,
          env,
          stdio: ["pipe", "pipe", "pipe"],
        });
      }

      if (!this.process.stdin || !this.process.stdout) {
        throw new Error("Failed to create stdio streams for agent subprocess");
      }

      // ── Capture stderr ───────────────────────────────────────────
      this.process.stderr?.on("data", (data: Buffer) => {
        const text = data.toString();
        this._stderrChunks.push(text);
        console.error(`[ACP ${harness.name}] stderr:`, text);
      });

      // ── Handle spawn errors (e.g. command not found) ─────────────
      this.process.on("error", (err) => {
        console.error(`[ACP ${harness.name}] process error:`, err);
        const stderr = this._stderrChunks.join("");
        const message = `Agent process error: ${err.message}`;
        this._onError?.({ message, stderr });
        if (this._initReject) {
          this._initReject(new Error(message));
          this._initReject = null;
        }
        this.setState("error");
      });

      // ── Handle unexpected process exits ──────────────────────────
      this.process.on("exit", (code, signal) => {
        console.log(
          `[ACP ${harness.name}] process exited with code ${code}, signal ${signal}`,
        );

        if (this._state === "initializing" && this._initReject) {
          // Process died before the SDK handshake completed — surface
          // the actual error from stderr instead of a generic timeout.
          const stderr = this._stderrChunks.join("");
          const errorLine =
            extractLastError(stderr) ?? `Process exited with code ${code}`;
          const message = `Agent failed to start: ${errorLine}`;
          this._onError?.({ message, stderr });
          this._initReject(new Error(message));
          this._initReject = null;
          this.setState("error");
        } else if (this._state !== "disconnected") {
          const stderr = this._stderrChunks.join("");
          if (code !== 0 && code !== null) {
            const errorLine =
              extractLastError(stderr) ?? `Process exited with code ${code}`;
            this._onError?.({
              message: `Agent exited unexpectedly: ${errorLine}`,
              stderr,
            });
          }
          this.setState("disconnected");
        }
      });

      // ── Race: SDK initialize vs. early process exit ──────────────
      const exitDuringInit = new Promise<never>((_resolve, reject) => {
        this._initReject = reject;
      });

      // Create the SDK stream from stdio
      const stream = ndJsonStream(
        // Writable → process stdin
        new WritableStream({
          write: async (chunk: Uint8Array) => {
            return new Promise<void>((resolve, reject) => {
              this.process!.stdin!.write(chunk, (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
          },
        }),
        // Readable → process stdout
        new ReadableStream({
          start: (controller) => {
            this.process!.stdout!.on("data", (data: Buffer) => {
              controller.enqueue(data);
            });
            this.process!.stdout!.on("end", () => {
              controller.close();
            });
            this.process!.stdout!.on("error", (err) => {
              controller.error(err);
            });
          },
        }),
      );

      // Create the client-side connection
      this.connection = new ClientSideConnection(
        (agent) => this.createClientHandler(agent),
        stream,
      );

      // Initialize — race against process exit so we get a clear error
      // if the agent crashes before the JSON-RPC handshake completes.
      const initResponse = await Promise.race([
        this.connection.initialize({
          protocolVersion: 1,
          clientCapabilities: {
            fs: { readTextFile: true, writeTextFile: true },
            terminal: true,
          },
          clientInfo: {
            name: "belay",
            title: "Belay",
            version: "0.1.0",
          },
        }),
        exitDuringInit,
      ]);

      // Successfully initialized — clear the early-exit trap
      this._initReject = null;

      console.log(
        `[ACP] Initialized with agent: ${JSON.stringify(initResponse.agentInfo)}, protocol version: ${initResponse.protocolVersion}`,
      );
      this.setState("ready");
    } catch (e) {
      this.setState("error");
      throw e;
    }
  }

  // ── Client interface implementation ─────────────────────────────────

  private createClientHandler(_agent: unknown): Client {
    void _agent;
    return {
      sessionUpdate: async (params: SessionNotification) => {
        this._onUpdate?.(params);
      },

      requestPermission: async (params: RequestPermissionRequest) => {
        if (this._onPermissionRequest) {
          return this._onPermissionRequest(params);
        }
        // Default: deny
        return { outcome: { outcome: "cancelled" } };
      },

      readTextFile: async (params: ReadTextFileRequest) => {
        const fs = await import("node:fs/promises");
        const content = await fs.readFile(params.path, "utf-8");
        return { content };
      },

      writeTextFile: async (params: WriteTextFileRequest) => {
        const fs = await import("node:fs/promises");
        await fs.writeFile(params.path, params.content, "utf-8");
        return {};
      },
    };
  }

  // ── Session & Prompt ────────────────────────────────────────────────

  async createSession(cwd?: string): Promise<{
    sessionId: string;
    modes?: {
      currentModeId: string;
      availableModes: Array<{
        id: string;
        name: string;
        description?: string | null;
      }>;
    } | null;
  }> {
    if (!this.connection) throw new Error("Not connected");

    const response = await this.connection.newSession({
      cwd: cwd || process.cwd(),
      mcpServers: [],
    });

    this._sessionId = response.sessionId;
    return {
      sessionId: response.sessionId,
      modes: response.modes ?? null,
    };
  }

  async sendPrompt(sessionId: string, content: string): Promise<void> {
    if (!this.connection) throw new Error("Not connected");

    await this.connection.prompt({
      sessionId,
      prompt: [{ type: "text", text: content }],
    });
  }

  async cancelPrompt(sessionId: string): Promise<void> {
    if (!this.connection) throw new Error("Not connected");
    await this.connection.cancel({ sessionId });
  }

  async setSessionMode(sessionId: string, modeId: string): Promise<void> {
    if (!this.connection) throw new Error("Not connected");
    await this.connection.setSessionMode({ sessionId, modeId });
  }

  // ── Disconnect ──────────────────────────────────────────────────────

  async disconnect(): Promise<void> {
    this._sessionId = null;
    this.connection = null;
    this._initReject = null;
    this._stderrChunks = [];

    if (this.process) {
      this.killProcessTree(this.process);
      this.process = null;
    }

    this.setState("disconnected");
  }

  /**
   * Kill a process and all its descendants.
   *
   * On Windows with `shell: true`, `process.kill()` only terminates the
   * cmd.exe wrapper — the actual agent subprocess keeps running.  We use
   * `taskkill /T /F` to kill the entire process tree.
   *
   * On Unix, `process.kill()` sends SIGTERM directly to the child (no
   * shell wrapper) which is sufficient.
   */
  private killProcessTree(proc: ChildProcess): void {
    const pid = proc.pid;
    try {
      if (pid && isWindows) {
        // /T = terminate child processes, /F = force
        execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
      } else {
        proc.kill();
      }
    } catch {
      // Fallback: try normal kill if taskkill fails
      try {
        proc.kill();
      } catch {
        // Process may already be dead — that's fine
      }
    }
  }
}
