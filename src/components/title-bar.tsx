import { useState, useEffect, useCallback } from "react";
import { Minus, Square, X, Globe, Settings } from "lucide-react";
import { HarnessSelector } from "@/components/harness/harness-selector";
import { HarnessRegistryDialog } from "@/components/harness/harness-registry-dialog";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { ThemeToggle } from "@/components/theme-toggle";

/** The standard Windows "restore" icon — two overlapping offset rectangles. */
function RestoreIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="3.5" y="5.5" width="7" height="7" rx="0.5" />
      <path d="M5.5 5.5V3.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2" />
    </svg>
  );
}

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [showRegistry, setShowRegistry] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    api
      .isMaximized()
      .then(setIsMaximized)
      .catch(() => {});
    api.onMaximize(() => setIsMaximized(true));
    api.onUnmaximize(() => setIsMaximized(false));
  }, []);

  const handleMinimize = useCallback(() => {
    window.electronAPI?.minimize();
  }, []);

  const handleMaximize = useCallback(() => {
    window.electronAPI?.maximize();
  }, []);

  const handleClose = useCallback(() => {
    window.electronAPI?.close();
  }, []);

  return (
    <header
      className="flex h-9 shrink-0 select-none items-center border-b border-border bg-background/80 backdrop-blur-sm"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      onDoubleClick={handleMaximize}
    >
      {/* Left — app title */}
      <div className="flex items-center gap-2 pl-3.5">
        <span className="text-[13px] font-medium tracking-tight text-foreground">
          Belay
        </span>
      </div>

      {/* ACP agent selector & registry */}
      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <HarnessSelector />
        <button
          type="button"
          onClick={() => setShowRegistry(true)}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Browse agent registry"
          title="Browse agent registry"
        >
          <Globe className="size-3.5" />
        </button>
      </div>

      {/* Spacer to push controls right */}
      <div className="flex-1" />

      {/* Settings & theme toggle */}
      <div
        className="flex h-full items-center gap-0.5"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Settings"
          title="Settings"
        >
          <Settings className="size-3.5" />
        </button>
        <ThemeToggle />
      </div>

      {/* Right — window controls */}
      <div
        className="flex h-full"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          onClick={handleMinimize}
          className="inline-flex h-full w-[46px] items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:bg-muted/60"
          aria-label="Minimize"
          type="button"
        >
          <Minus className="size-[15px]" strokeWidth={1.8} />
        </button>

        <button
          onClick={handleMaximize}
          className="inline-flex h-full w-[46px] items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:bg-muted/60"
          aria-label={isMaximized ? "Restore" : "Maximize"}
          type="button"
        >
          {isMaximized ? (
            <RestoreIcon className="size-[15px]" />
          ) : (
            <Square className="size-[14px]" strokeWidth={1.6} />
          )}
        </button>

        <button
          onClick={handleClose}
          className="inline-flex h-full w-[46px] items-center justify-center text-muted-foreground transition-colors hover:bg-destructive hover:text-white active:bg-destructive/90"
          aria-label="Close"
          type="button"
        >
          <X className="size-[15px]" strokeWidth={1.8} />
        </button>
      </div>

      {/* Dialogs */}
      <HarnessRegistryDialog
        open={showRegistry}
        onClose={() => setShowRegistry(false)}
      />
      <SettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onOpenRegistry={() => {
          setShowSettings(false);
          setShowRegistry(true);
        }}
      />
    </header>
  );
}
