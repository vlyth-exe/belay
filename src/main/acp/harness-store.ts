import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { RegistryAgent } from "./registry";

export interface HarnessConfig {
  agentId: string;
  name: string;
  version: string;
  description: string;
  icon?: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
  mcpServers?: Array<{
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }>;
  useWsl?: boolean;
  wslDistro?: string;
  /** Linux binary command (populated from the linux-* distribution entry for WSL use) */
  linuxCommand?: string;
  /** Linux binary args (populated from the linux-* distribution entry for WSL use) */
  linuxArgs?: string[];
}

interface NpxDistribution {
  package: string;
  args?: string[];
  env?: Record<string, string>;
}

interface BinaryPlatformEntry {
  cmd: string;
  args?: string[];
}

interface UvxDistribution {
  package: string;
  args?: string[];
}

interface Distribution {
  npx?: NpxDistribution;
  binary?: Record<string, BinaryPlatformEntry>;
  uvx?: UvxDistribution;
}

/** Architecture aliases: x64 ≡ amd64 ≡ x86_64, arm64 ≡ aarch64 */
const ARCH_ALIASES: Record<string, string[]> = {
  x64: ["x64", "amd64", "x86_64"],
  arm64: ["arm64", "aarch64"],
};

/** Check whether a distribution key mentions an architecture compatible with `arch`. */
function archMatches(key: string, arch: string): boolean {
  const aliases = ARCH_ALIASES[arch] || [arch];
  return aliases.some((a) => key.includes(a));
}

const CONFIG_DIR = path.join(os.homedir(), ".belay");
const CONFIG_FILE = path.join(CONFIG_DIR, "harnesses.json");

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function readConfig(): Record<string, HarnessConfig> {
  ensureConfigDir();
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeConfig(config: Record<string, HarnessConfig>): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

export function listInstalled(): HarnessConfig[] {
  return Object.values(readConfig());
}

export function getHarness(agentId: string): HarnessConfig | undefined {
  return readConfig()[agentId];
}

export function installHarness(agent: RegistryAgent): void {
  console.log(`[ACP] Installing harness: ${agent.name} (${agent.id})`);
  console.log(
    `[ACP] Agent distribution keys: ${Object.keys(agent.distribution).join(", ")}`,
  );

  const config = readConfig();
  const dist = agent.distribution as unknown as Distribution;

  let command = "";
  let args: string[] = [];
  let env: Record<string, string> = {};

  // Prefer npx distribution
  if (dist.npx) {
    command = "npx";
    args = [dist.npx.package, ...(dist.npx.args || [])];
    env = dist.npx.env || {};
    console.log(`[ACP] Using npx distribution: ${dist.npx.package}`);
  } else if (dist.binary) {
    // For binary distribution, find the matching platform entry
    const binaryKeys = Object.keys(dist.binary);
    const platform = `${process.platform}-${process.arch}`;
    console.log(
      `[ACP] Binary distribution keys: ${binaryKeys.join(", ")} (looking for ${platform})`,
    );

    const platKey = binaryKeys.find(
      (k) =>
        (k.includes(process.platform) ||
          (process.platform === "win32" && k.includes("windows"))) &&
        archMatches(k, process.arch),
    );
    if (platKey) {
      command = dist.binary[platKey].cmd;
      args = dist.binary[platKey].args || [];
      console.log(`[ACP] Matched native platform key: ${platKey}`);
    } else if (process.platform === "win32") {
      // No native Windows binary — look for a Linux binary to use via WSL
      const linuxPlatKey = binaryKeys.find(
        (k) =>
          (k.includes("linux") || k.includes("ubuntu")) &&
          archMatches(k, process.arch),
      );
      if (linuxPlatKey) {
        command = dist.binary[linuxPlatKey].cmd;
        args = dist.binary[linuxPlatKey].args || [];
        console.log(
          `[ACP] No Windows binary for ${agent.name}, using Linux binary for WSL (key: ${linuxPlatKey}, cmd: ${command})`,
        );
      } else {
        console.warn(
          `[ACP] No Windows or Linux binary found for ${agent.name}. Keys: ${binaryKeys.join(", ")}`,
        );
        command = `echo "Platform ${platform} not supported for ${agent.name}"`;
      }
    } else {
      command = `echo "Platform ${platform} not supported for ${agent.name}"`;
    }
  } else if (dist.uvx) {
    command = "uvx";
    args = [dist.uvx.package, ...(dist.uvx.args || [])];
  }

  config[agent.id] = {
    agentId: agent.id,
    name: agent.name,
    version: agent.version,
    description: agent.description,
    icon: agent.icon,
    command,
    args,
    env,
  };

  // Store the Linux binary command for WSL use (available even when
  // a native Windows binary exists, so the user can toggle WSL later).
  if (dist.binary) {
    const linuxPlatKey = Object.keys(dist.binary).find(
      (k) =>
        (k.includes("linux") || k.includes("ubuntu")) &&
        archMatches(k, process.arch),
    );
    if (linuxPlatKey) {
      config[agent.id].linuxCommand = dist.binary[linuxPlatKey].cmd;
      config[agent.id].linuxArgs = dist.binary[linuxPlatKey].args || [];
      console.log(
        `[ACP] Stored Linux binary for WSL fallback (key: ${linuxPlatKey}, cmd: ${dist.binary[linuxPlatKey].cmd})`,
      );
    }
  }

  // On Windows, agents distributed via npx or uvx work natively.
  // Binary-only agents that didn't match our platform may need WSL.
  if (process.platform === "win32" && dist.binary && !dist.npx && !dist.uvx) {
    const binaryKeys = Object.keys(dist.binary);
    const hasNative = binaryKeys.some(
      (k) =>
        (k.includes("win32") || k.includes("windows")) &&
        archMatches(k, process.arch),
    );
    if (!hasNative) {
      // No native Windows binary — look for a Linux binary to use via WSL
      const linuxPlatKey = binaryKeys.find(
        (k) =>
          (k.includes("linux") || k.includes("ubuntu")) &&
          archMatches(k, process.arch),
      );
      if (linuxPlatKey) {
        config[agent.id].useWsl = true;
        config[agent.id].command = dist.binary[linuxPlatKey].cmd;
        config[agent.id].args = dist.binary[linuxPlatKey].args || [];
        console.log(
          `[ACP] No native Windows binary for ${agent.name}, using Linux binary via WSL (key: ${linuxPlatKey}, cmd: ${dist.binary[linuxPlatKey].cmd})`,
        );
      } else {
        console.warn(
          `[ACP] No native Windows or Linux binary found for ${agent.name}. Keys: ${binaryKeys.join(", ")}`,
        );
      }
    }
  }

  writeConfig(config);
  console.log(
    `[ACP] Harness installed: ${agent.name} → command: ${command} ${args.join(" ")}`,
  );
  console.log(`[ACP] Config written to ${CONFIG_FILE}`);
}

export function uninstallHarness(agentId: string): void {
  const config = readConfig();
  delete config[agentId];
  writeConfig(config);
}

export function updateHarness(
  agentId: string,
  updates: Partial<
    Pick<
      HarnessConfig,
      | "cwd"
      | "env"
      | "mcpServers"
      | "args"
      | "useWsl"
      | "wslDistro"
      | "command"
      | "linuxCommand"
      | "linuxArgs"
    >
  >,
): void {
  const config = readConfig();
  if (!config[agentId]) return;
  Object.assign(config[agentId], updates);
  writeConfig(config);
}
