import { useState, useRef, useEffect } from "react";
import { ChevronDown, Circle, Plug, AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useInstalledHarnesses,
  useConnectionState,
  useAcpActions,
  useAcpError,
} from "@/hooks/use-acp";

export function HarnessSelector() {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { harnesses, refresh } = useInstalledHarnesses();
  const connectionState = useConnectionState(selectedId ?? "");
  const { connect, disconnect } = useAcpActions();
  const { error: acpError, clearError } = useAcpError();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const stateColor = {
    disconnected: "text-muted-foreground",
    initializing: "text-yellow-500",
    ready: "text-green-500",
    error: "text-red-500",
  }[connectionState];

  const selected = harnesses.find((h) => h.agentId === selectedId);

  async function handleSelect(agentId: string) {
    setSelectedId(agentId);
    setOpen(false);
    try {
      await connect(agentId);
    } catch (err) {
      console.error("Failed to connect:", err);
    }
  }

  async function handleDisconnect() {
    if (selectedId) await disconnect(selectedId);
    setSelectedId(null);
  }

  return (
    <div ref={ref} className="relative">
      {acpError && (
        <div className="absolute left-0 top-full z-50 mt-1 w-80 rounded-lg border border-red-200 bg-red-50 p-3 shadow-lg dark:border-red-900 dark:bg-red-950">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                Agent failed to start
              </p>
              <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                {acpError.message}
              </p>
              {acpError.stderr && (
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300">
                    Show details
                  </summary>
                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-red-100 p-2 text-[10px] text-red-900 dark:bg-red-900 dark:text-red-200">
                    {acpError.stderr.slice(-500)}
                  </pre>
                </details>
              )}
            </div>
            <button
              type="button"
              onClick={clearError}
              className="shrink-0 rounded p-0.5 hover:bg-red-200 dark:hover:bg-red-800"
            >
              <X className="size-3.5 text-red-600 dark:text-red-400" />
            </button>
          </div>
        </div>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (!open) refresh();
          setOpen(!open);
        }}
        className="gap-1.5 text-[13px]"
      >
        <Circle className={`size-2 fill-current ${stateColor}`} />
        <span className="max-w-[120px] truncate">
          {connectionState === "ready" && selected
            ? selected.name
            : "Select Agent"}
        </span>
        <ChevronDown className="size-3.5 opacity-50" />
      </Button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-popover p-1 shadow-md">
          {harnesses.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              No agents installed.
              <br />
              <span className="text-xs">
                Browse the registry to install one.
              </span>
            </div>
          ) : (
            <div className="space-y-0.5">
              {harnesses.map((harness) => (
                <button
                  key={harness.agentId}
                  type="button"
                  onClick={() => handleSelect(harness.agentId)}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="font-medium">{harness.name}</span>
                  <span className="text-xs text-muted-foreground">
                    v{harness.version}
                  </span>
                </button>
              ))}
            </div>
          )}

          {connectionState === "ready" && (
            <div className="border-t border-border pt-1 mt-1">
              <button
                type="button"
                onClick={handleDisconnect}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-muted"
              >
                <Plug className="size-3.5" />
                Disconnect
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
