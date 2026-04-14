/**
 * Client-side method implementations for ACP agents.
 * These handle fs and terminal requests from agents.
 */

import * as fs from "node:fs/promises";
import { ChildProcess, spawn } from "node:child_process";

/** Active terminals keyed by ID */
const terminals = new Map<string, { process: ChildProcess; output: string; exitStatus: { exitCode: number | null; signal: string | null } | null }>();

let terminalCounter = 0;

/** Read a text file */
export async function readTextFile(params: { path: string }): Promise<{ content: string }> {
  const content = await fs.readFile(params.path, "utf-8");
  return { content };
}

/** Write a text file */
export async function writeTextFile(params: { path: string; content: string }): Promise<Record<string, never>> {
  await fs.writeFile(params.path, params.content, "utf-8");
  return {};
}

/** Create a terminal */
export async function createTerminal(
  params: { command: string; args?: string[]; env?: Record<string, string>; cwd?: string }
): Promise<{ id: string }> {
  const id = `term_${++terminalCounter}`;
  const child = spawn(params.command, params.args || [], {
    cwd: params.cwd,
    env: { ...process.env, ...params.env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let output = "";
  child.stdout?.on("data", (data: Buffer) => { output += data.toString(); });
  child.stderr?.on("data", (data: Buffer) => { output += data.toString(); });

  terminals.set(id, {
    process: child,
    output,
    exitStatus: null,
  });

  child.on("exit", (code, signal) => {
    const term = terminals.get(id);
    if (term) {
      term.exitStatus = { exitCode: code, signal };
    }
  });

  return { id };
}

/** Get terminal output */
export async function terminalOutput(params: { id: string }): Promise<{ output: string; exitStatus: { exitCode: number | null; signal: string | null } | null }> {
  const term = terminals.get(params.id);
  if (!term) throw new Error(`Terminal ${params.id} not found`);
  return { output: term.output, exitStatus: term.exitStatus };
}

/** Wait for terminal exit */
export async function waitForTerminalExit(params: { id: string }): Promise<{ exitStatus: { exitCode: number | null; signal: string | null } }> {
  const term = terminals.get(params.id);
  if (!term) throw new Error(`Terminal ${params.id} not found`);

  if (term.exitStatus) {
    return { exitStatus: term.exitStatus };
  }

  return new Promise((resolve) => {
    term.process.on("exit", (code, signal) => {
      resolve({ exitStatus: { exitCode: code, signal } });
    });
  });
}

/** Release terminal */
export async function releaseTerminal(params: { id: string }): Promise<void> {
  const term = terminals.get(params.id);
  if (term) {
    term.process.kill();
    terminals.delete(params.id);
  }
}

/** Kill terminal */
export async function killTerminal(params: { id: string }): Promise<void> {
  const term = terminals.get(params.id);
  if (term) {
    term.process.kill();
  }
}
