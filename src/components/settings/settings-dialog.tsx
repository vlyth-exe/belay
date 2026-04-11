import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  ChevronRight,
  FolderOpen,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  Plug,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstalledHarnesses, useAcpActions } from "@/hooks/use-acp";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  onOpenRegistry: () => void;
}

interface AgentEdits {
  command: string;
  cwd: string;
  env: { key: string; value: string }[];
  args: string[];
  useWsl: boolean;
  wslDistro: string;
  linuxCommand: string;
  linuxArgs: string[];
}

function toEnvPairs(
  env: Record<string, string>,
): { key: string; value: string }[] {
  return Object.entries(env).map(([key, value]) => ({ key, value }));
}

function fromEnvPairs(
  pairs: { key: string; value: string }[],
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const pair of pairs) {
    if (pair.key.trim()) {
      env[pair.key.trim()] = pair.value;
    }
  }
  return env;
}

export function SettingsDialog({
  open,
  onClose,
  onOpenRegistry,
}: SettingsDialogProps) {
  const { harnesses, refresh } = useInstalledHarnesses();
  const { disconnect } = useAcpActions();
  const [connectionStates, setConnectionStates] = useState<
    Record<string, string>
  >({});
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, AgentEdits>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);
  const initializedRef = useRef(false);

  // Track per-agent connection states
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    const loadStates = async () => {
      const states: Record<string, string> = {};
      for (const h of harnesses) {
        states[h.agentId] =
          (await api.acpGetConnectionState(h.agentId)) ?? "disconnected";
      }
      setConnectionStates(states);
    };
    loadStates();
    const unsubscribe = api.acpOnConnectionStateChange?.(
      ({ agentId, state }) => {
        setConnectionStates((prev) => ({
          ...prev,
          [agentId]: state as string,
        }));
      },
    );
    return () => unsubscribe?.();
  }, [harnesses]);

  useEffect(() => {
    if (open) {
      refresh();
      setEdits({});
      setDirty(new Set());
      setExpandedAgent(null);
      initializedRef.current = false;
    }
  }, [open, refresh]);

  // Build edits from current harness data when loaded
  useEffect(() => {
    if (harnesses.length > 0 && !initializedRef.current) {
      initializedRef.current = true;
      const initial: Record<string, AgentEdits> = {};
      for (const h of harnesses) {
        initial[h.agentId] = {
          command: h.command || "",
          cwd: h.cwd || "",
          env: toEnvPairs(h.env || {}),
          args: [...(h.args || [])],
          useWsl: h.useWsl ?? false,
          wslDistro: h.wslDistro || "",
          linuxCommand: h.linuxCommand || "",
          linuxArgs: [...(h.linuxArgs || [])],
        };
      }
      setEdits(initial);
    }
  }, [harnesses]);

  if (!open) return null;

  function getEdits(agentId: string): AgentEdits {
    return (
      edits[agentId] || {
        command: "",
        cwd: "",
        env: [],
        args: [],
        useWsl: false,
        wslDistro: "",
        linuxCommand: "",
        linuxArgs: [],
      }
    );
  }

  function markDirty(agentId: string) {
    setDirty((prev) => new Set(prev).add(agentId));
  }

  function updateCwd(agentId: string, cwd: string) {
    setEdits((prev) => ({
      ...prev,
      [agentId]: { ...getEdits(agentId), cwd },
    }));
    markDirty(agentId);
  }

  function updateEnvKey(agentId: string, index: number, key: string) {
    const current = getEdits(agentId);
    const env = [...current.env];
    env[index] = { ...env[index], key };
    setEdits((prev) => ({ ...prev, [agentId]: { ...current, env } }));
    markDirty(agentId);
  }

  function updateEnvValue(agentId: string, index: number, value: string) {
    const current = getEdits(agentId);
    const env = [...current.env];
    env[index] = { ...env[index], value };
    setEdits((prev) => ({ ...prev, [agentId]: { ...current, env } }));
    markDirty(agentId);
  }

  function addEnvPair(agentId: string) {
    const current = getEdits(agentId);
    setEdits((prev) => ({
      ...prev,
      [agentId]: { ...current, env: [...current.env, { key: "", value: "" }] },
    }));
    markDirty(agentId);
  }

  function removeEnvPair(agentId: string, index: number) {
    const current = getEdits(agentId);
    const env = current.env.filter((_, i) => i !== index);
    setEdits((prev) => ({ ...prev, [agentId]: { ...current, env } }));
    markDirty(agentId);
  }

  function updateArgs(agentId: string, argsText: string) {
    const current = getEdits(agentId);
    const args = argsText
      .split(" ")
      .map((a) => a.trim())
      .filter(Boolean);
    setEdits((prev) => ({ ...prev, [agentId]: { ...current, args } }));
    markDirty(agentId);
  }

  function updateUseWsl(agentId: string, useWsl: boolean) {
    setEdits((prev) => ({
      ...prev,
      [agentId]: { ...getEdits(agentId), useWsl },
    }));
    markDirty(agentId);
  }

  function updateWslDistro(agentId: string, wslDistro: string) {
    setEdits((prev) => ({
      ...prev,
      [agentId]: { ...getEdits(agentId), wslDistro },
    }));
    markDirty(agentId);
  }

  function updateCommand(agentId: string, command: string) {
    setEdits((prev) => ({
      ...prev,
      [agentId]: { ...getEdits(agentId), command },
    }));
    markDirty(agentId);
  }

  function updateLinuxCommand(agentId: string, linuxCommand: string) {
    setEdits((prev) => ({
      ...prev,
      [agentId]: { ...getEdits(agentId), linuxCommand },
    }));
    markDirty(agentId);
  }

  async function browseExecutable(
    agentId: string,
    field: "command" | "linuxCommand",
  ) {
    const filePath = await window.electronAPI?.dialogOpenFile?.();
    if (filePath) {
      if (field === "command") {
        updateCommand(agentId, filePath);
      } else {
        updateLinuxCommand(agentId, filePath);
      }
    }
  }

  async function saveAgent(agentId: string) {
    const e = getEdits(agentId);
    setSaving(agentId);
    try {
      await window.electronAPI?.acpUpdateHarness(agentId, {
        command: e.command || undefined,
        cwd: e.cwd || undefined,
        env: fromEnvPairs(e.env),
        args: e.args,
        useWsl: e.useWsl || undefined,
        wslDistro: e.wslDistro || undefined,
        linuxCommand: e.linuxCommand || undefined,
        linuxArgs: e.linuxArgs.length > 0 ? e.linuxArgs : undefined,
      });
      setDirty((prev) => {
        const next = new Set(prev);
        next.delete(agentId);
        return next;
      });
      await refresh();
    } catch (err) {
      console.error("Failed to save agent settings:", err);
    } finally {
      setSaving(null);
    }
  }

  function resetAgent(agentId: string) {
    const harness = harnesses.find((h) => h.agentId === agentId);
    if (!harness) return;
    setEdits((prev) => ({
      ...prev,
      [agentId]: {
        command: harness.command || "",
        cwd: harness.cwd || "",
        env: toEnvPairs(harness.env || {}),
        args: [...(harness.args || [])],
        useWsl: harness.useWsl ?? false,
        wslDistro: harness.wslDistro || "",
        linuxCommand: harness.linuxCommand || "",
        linuxArgs: [...(harness.linuxArgs || [])],
      },
    }));
    setDirty((prev) => {
      const next = new Set(prev);
      next.delete(agentId);
      return next;
    });
  }

  async function handleDisconnect(agentId: string) {
    await disconnect(agentId);
    await refresh();
  }

  function argsToString(args: string[]): string {
    return args.join(" ");
  }

  return createPortal(
    <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/50 p-6 pt-10">
      <div
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
        style={{ maxHeight: "calc(100vh - 5rem)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* ACP Section */}
          <div className="border-b border-border px-5 py-4">
            <div className="mb-1 flex items-center gap-2">
              <Plug className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Agent Client Protocol</h3>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Manage installed agents, configure environment variables and
              launch arguments.
            </p>

            {/* Browse registry link */}
            <Button
              variant="outline"
              size="sm"
              className="mb-4 w-full gap-2"
              onClick={() => {
                onClose();
                onOpenRegistry();
              }}
            >
              <Globe className="size-3.5" />
              Browse Agent Registry
              <span className="ml-auto text-xs text-muted-foreground">
                {harnesses.length} installed
              </span>
            </Button>

            {/* Installed agents list */}
            {harnesses.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                No agents installed.{" "}
                <button
                  type="button"
                  className="text-primary underline underline-offset-2 hover:no-underline"
                  onClick={() => {
                    onClose();
                    onOpenRegistry();
                  }}
                >
                  Browse the registry
                </button>{" "}
                to install one.
              </div>
            ) : (
              <div className="space-y-2">
                {harnesses.map((harness) => {
                  const isExpanded = expandedAgent === harness.agentId;
                  const agentEdits = getEdits(harness.agentId);
                  const isDirty = dirty.has(harness.agentId);
                  const isSaving = saving === harness.agentId;
                  const connState =
                    connectionStates[harness.agentId] ?? "disconnected";

                  return (
                    <div
                      key={harness.agentId}
                      className="rounded-lg border border-border"
                    >
                      {/* Agent header row */}
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedAgent(isExpanded ? null : harness.agentId)
                        }
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                      >
                        <ChevronRight
                          className={
                            "size-4 shrink-0 text-muted-foreground transition-transform " +
                            (isExpanded ? "rotate-90" : "")
                          }
                        />
                        {harness.icon ? (
                          <img
                            src={harness.icon}
                            alt=""
                            className="size-6 rounded dark:invert"
                          />
                        ) : (
                          <div className="flex size-6 shrink-0 items-center justify-center rounded bg-primary/10 text-xs font-bold text-primary">
                            {harness.name.charAt(0)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium">
                            {harness.name}
                          </span>
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            v{harness.version}
                          </span>
                        </div>
                        {connState !== "disconnected" && (
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span
                              className={
                                "size-2 rounded-full " +
                                (connState === "ready"
                                  ? "bg-green-500"
                                  : connState === "initializing"
                                    ? "bg-yellow-500 animate-pulse"
                                    : "bg-red-500")
                              }
                            />
                            {connState === "ready" && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDisconnect(harness.agentId);
                                }}
                                className="text-xs text-destructive hover:underline"
                              >
                                Disconnect
                              </button>
                            )}
                          </div>
                        )}
                        <span className="truncate text-xs text-muted-foreground font-mono">
                          {harness.command}
                        </span>
                        {isDirty && (
                          <span className="size-2 shrink-0 rounded-full bg-primary" />
                        )}
                      </button>

                      {/* Expanded config */}
                      {isExpanded && (
                        <div className="border-t border-border px-3 py-3 space-y-4">
                          {/* Command / Executable */}
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Command / Executable
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={agentEdits.command}
                                onChange={(e) =>
                                  updateCommand(harness.agentId, e.target.value)
                                }
                                placeholder="e.g. npx or path/to/binary"
                                className="flex-1 rounded-lg border border-border bg-muted/40 px-3 py-1.5 font-mono text-sm focus:border-ring focus:outline-none"
                              />
                              <Button
                                variant="outline"
                                size="icon-sm"
                                onClick={() =>
                                  browseExecutable(harness.agentId, "command")
                                }
                                title="Browse for executable"
                              >
                                <FolderOpen className="size-3.5" />
                              </Button>
                            </div>
                          </div>

                          {/* Working Directory */}
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Working Directory
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={agentEdits.cwd}
                                onChange={(e) =>
                                  updateCwd(harness.agentId, e.target.value)
                                }
                                placeholder="Default"
                                className="flex-1 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
                              />
                              <Button variant="outline" size="icon-sm">
                                <FolderOpen className="size-3.5" />
                              </Button>
                            </div>
                          </div>

                          {/* Arguments */}
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Arguments
                            </label>
                            <input
                              type="text"
                              value={argsToString(agentEdits.args)}
                              onChange={(e) =>
                                updateArgs(harness.agentId, e.target.value)
                              }
                              placeholder="No arguments"
                              className="w-full rounded-lg border border-border bg-muted/40 px-3 py-1.5 font-mono text-sm focus:border-ring focus:outline-none"
                            />
                          </div>

                          {/* WSL Mode (Windows only) */}
                          {navigator.platform.startsWith("Win") && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div>
                                  <label className="mb-0.5 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    WSL Mode
                                  </label>
                                  <p className="text-xs text-muted-foreground">
                                    Run this agent inside Windows Subsystem for
                                    Linux
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={agentEdits.useWsl}
                                  onClick={() =>
                                    updateUseWsl(
                                      harness.agentId,
                                      !agentEdits.useWsl,
                                    )
                                  }
                                  className={
                                    "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors " +
                                    (agentEdits.useWsl
                                      ? "bg-primary"
                                      : "bg-muted border border-border")
                                  }
                                >
                                  <span
                                    className={
                                      "inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform " +
                                      (agentEdits.useWsl
                                        ? "translate-x-4.5"
                                        : "translate-x-0.5")
                                    }
                                  />
                                </button>
                              </div>
                              {agentEdits.useWsl && (
                                <div className="space-y-3">
                                  <div>
                                    <label className="mb-1 block text-xs text-muted-foreground">
                                      Distribution
                                    </label>
                                    <input
                                      type="text"
                                      value={agentEdits.wslDistro}
                                      onChange={(e) =>
                                        updateWslDistro(
                                          harness.agentId,
                                          e.target.value,
                                        )
                                      }
                                      placeholder="Default (leave empty)"
                                      className="w-full rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm focus:border-ring focus:outline-none"
                                    />
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      Optional WSL distribution name (e.g.
                                      "Ubuntu"). Uses the default distro if
                                      empty.
                                    </p>
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs text-muted-foreground">
                                      WSL Command
                                    </label>
                                    <div className="flex gap-2">
                                      <input
                                        type="text"
                                        value={agentEdits.linuxCommand}
                                        onChange={(e) =>
                                          updateLinuxCommand(
                                            harness.agentId,
                                            e.target.value,
                                          )
                                        }
                                        placeholder="Linux command to run inside WSL"
                                        className="flex-1 rounded-lg border border-border bg-muted/40 px-3 py-1.5 font-mono text-sm focus:border-ring focus:outline-none"
                                      />
                                      <Button
                                        variant="outline"
                                        size="icon-sm"
                                        onClick={() =>
                                          browseExecutable(
                                            harness.agentId,
                                            "linuxCommand",
                                          )
                                        }
                                        title="Browse for executable"
                                      >
                                        <FolderOpen className="size-3.5" />
                                      </Button>
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      Command to run inside WSL. Can be a Linux
                                      binary path or a command available in WSL
                                      PATH.
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Environment Variables */}
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Environment Variables
                            </label>
                            <div className="space-y-2">
                              {agentEdits.env.map((pair, i) => (
                                <div key={i} className="flex gap-2">
                                  <input
                                    type="text"
                                    value={pair.key}
                                    onChange={(e) =>
                                      updateEnvKey(
                                        harness.agentId,
                                        i,
                                        e.target.value,
                                      )
                                    }
                                    placeholder="KEY"
                                    className="flex-1 rounded-lg border border-border bg-muted/40 px-3 py-1.5 font-mono text-sm focus:border-ring focus:outline-none"
                                  />
                                  <input
                                    type="text"
                                    value={pair.value}
                                    onChange={(e) =>
                                      updateEnvValue(
                                        harness.agentId,
                                        i,
                                        e.target.value,
                                      )
                                    }
                                    placeholder="value"
                                    className="flex-1 rounded-lg border border-border bg-muted/40 px-3 py-1.5 font-mono text-sm focus:border-ring focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeEnvPair(harness.agentId, i)
                                    }
                                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </button>
                                </div>
                              ))}
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => addEnvPair(harness.agentId)}
                                className="gap-1"
                              >
                                <Plus className="size-3" />
                                Add Variable
                              </Button>
                            </div>
                          </div>

                          {/* Save / Reset */}
                          {isDirty && (
                            <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => resetAgent(harness.agentId)}
                                className="gap-1.5"
                              >
                                <RotateCcw className="size-3" />
                                Reset
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => saveAgent(harness.agentId)}
                                disabled={isSaving}
                                className="gap-1.5"
                              >
                                <Save className="size-3" />
                                {isSaving ? "Saving…" : "Save Changes"}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.getElementById("app-container")!,
  );
}
