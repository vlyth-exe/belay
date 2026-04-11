import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Download, Trash2, Search, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRegistryAgents, useInstalledHarnesses } from "@/hooks/use-acp";
import type { AcpAgentManifest } from "@/types/acp";

interface HarnessRegistryDialogProps {
  open: boolean;
  onClose: () => void;
}

export function HarnessRegistryDialog({
  open,
  onClose,
}: HarnessRegistryDialogProps) {
  const { agents, loading, error, fetch } = useRegistryAgents();
  const { harnesses, refresh: refreshInstalled } = useInstalledHarnesses();
  const [search, setSearch] = useState("");
  const [installing, setInstalling] = useState<string | null>(null);
  const [lastInstalled, setLastInstalled] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetch();
      refreshInstalled();
      setLastInstalled(null);
    }
  }, [open, fetch, refreshInstalled]);

  // Build a set of installed agent IDs for quick lookup
  const installedIds = new Set(harnesses.map((h) => h.agentId));

  if (!open) return null;

  const filtered = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.description.toLowerCase().includes(search.toLowerCase()),
  );

  async function handleInstall(agent: AcpAgentManifest) {
    setInstalling(agent.id);
    try {
      await window.electronAPI?.acpInstallHarness(agent);
      await refreshInstalled();
      setLastInstalled(agent.id);
    } catch (err) {
      console.error("Failed to install:", err);
    } finally {
      setInstalling(null);
    }
  }

  async function handleUninstall(agentId: string) {
    setInstalling(agentId);
    try {
      await window.electronAPI?.acpUninstallHarness(agentId);
      await refreshInstalled();
      setLastInstalled(null);
    } catch (err) {
      console.error("Failed to uninstall:", err);
    } finally {
      setInstalling(null);
    }
  }

  return createPortal(
    <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/50 p-6 pt-16">
      <div
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
        style={{ maxHeight: "calc(100vh - 8rem)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Agent Registry</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {harnesses.length} installed · {agents.length} available
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-border px-5 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agents..."
              className="w-full rounded-lg border border-border bg-muted/40 py-2 pl-9 pr-3 text-sm focus:border-ring focus:outline-none"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="py-8 text-center text-sm text-destructive">
              Failed to load registry: {error}
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No agents found.
            </div>
          )}

          <div className="grid gap-3">
            {filtered.map((agent) => {
              const isInstalled = installedIds.has(agent.id);
              const isBusy = installing === agent.id;
              const justInstalled = lastInstalled === agent.id;

              return (
                <div
                  key={agent.id}
                  className={`flex items-start gap-3 rounded-lg border p-4 transition-colors ${
                    justInstalled
                      ? "border-green-500/40 bg-green-500/5"
                      : isInstalled
                        ? "border-primary/20 bg-primary/5"
                        : "border-border"
                  }`}
                >
                  {agent.icon ? (
                    <img
                      src={agent.icon}
                      alt={agent.name}
                      className="size-10 shrink-0 rounded-lg dark:invert"
                    />
                  ) : (
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                      {agent.name.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{agent.name}</span>
                      <span className="text-xs text-muted-foreground">
                        v{agent.version}
                      </span>
                      {isInstalled && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          <Check className="size-2.5" />
                          Installed
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                      {agent.description}
                    </p>
                  </div>

                  {isInstalled ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUninstall(agent.id)}
                      disabled={isBusy}
                      className="shrink-0 text-destructive hover:bg-destructive/10"
                    >
                      {isBusy ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                      Remove
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleInstall(agent)}
                      disabled={isBusy}
                      className="shrink-0"
                    >
                      {isBusy ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : justInstalled ? (
                        <Check className="size-3.5" />
                      ) : (
                        <Download className="size-3.5" />
                      )}
                      {isBusy
                        ? "Installing…"
                        : justInstalled
                          ? "Done"
                          : "Install"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.getElementById("app-container")!,
  );
}
