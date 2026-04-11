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
import {
  useInstalledHarnesses,
  useConnectionState,
  useAcpActions,
} from "@/hooks/use-acp";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  onOpenRegistry: () => void;
}

interface AgentEdits {
  cwd: string;
  env: { key: string; value: string }[];
  args: string[];
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
  const connectionState = useConnectionState();
  const { disconnect } = useAcpActions();
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, AgentEdits>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);
  const initializedRef = useRef(false);

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
          cwd: h.cwd || "",
          env: toEnvPairs(h.env || {}),
          args: [...(h.args || [])],
        };
      }
      setEdits(initial);
    }
  }, [harnesses]);

  if (!open) return null;

  function getEdits(agentId: string): AgentEdits {
    return (
      edits[agentId] || {
        cwd: "",
        env: [],
        args: [],
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

  async function saveAgent(agentId: string) {
    const e = getEdits(agentId);
    setSaving(agentId);
    try {
      await window.electronAPI?.acpUpdateHarness(agentId, {
        cwd: e.cwd || undefined,
        env: fromEnvPairs(e.env),
        args: e.args,
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
        cwd: harness.cwd || "",
        env: toEnvPairs(harness.env || {}),
        args: [...(harness.args || [])],
      },
    }));
    setDirty((prev) => {
      const next = new Set(prev);
      next.delete(agentId);
      return next;
    });
  }

  async function handleDisconnect() {
    await disconnect();
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

            {/* Connection status */}
            <div className="mb-4 flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <span
                className={
                  "size-2 rounded-full " +
                  (connectionState === "ready"
                    ? "bg-green-500"
                    : connectionState === "initializing"
                      ? "bg-yellow-500 animate-pulse"
                      : connectionState === "error"
                        ? "bg-red-500"
                        : "bg-muted-foreground/40")
                }
              />
              <span className="flex-1 text-sm text-muted-foreground">
                {connectionState === "ready"
                  ? "Agent connected"
                  : connectionState === "initializing"
                    ? "Connecting…"
                    : connectionState === "error"
                      ? "Connection error"
                      : "No agent connected"}
              </span>
              {connectionState === "ready" && (
                <Button variant="outline" size="xs" onClick={handleDisconnect}>
                  Disconnect
                </Button>
              )}
            </div>

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
