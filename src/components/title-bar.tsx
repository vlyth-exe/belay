import { useState, useEffect, useCallback, useRef } from "react";
import { Minus, Square, X, Globe } from "lucide-react";
import { HarnessSelector } from "@/components/harness/harness-selector";
import { HarnessRegistryDialog } from "@/components/harness/harness-registry-dialog";
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
  const lastClickTimeRef = useRef(0);
  const dragStartedRef = useRef(false);
  const dragStartPosRef = useRef({ screenX: 0, screenY: 0 });
  const dragCleanupRef = useRef<(() => void) | null>(null);

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

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      // Only respond to primary button on non-interactive areas
      const target = e.target as HTMLElement;
      if (e.button !== 0 || target.closest("button")) {
        return;
      }

      // Cancel any previous drag listeners that are still active
      if (dragCleanupRef.current) {
        dragCleanupRef.current();
        dragCleanupRef.current = null;
      }

      const now = Date.now();
      if (now - lastClickTimeRef.current < 300) {
        // Double-click → toggle maximize
        lastClickTimeRef.current = 0;
        handleMaximize();
        return;
      }
      lastClickTimeRef.current = now;

      // Record start position and prepare for potential drag
      dragStartedRef.current = false;
      dragStartPosRef.current = { screenX: e.screenX, screenY: e.screenY };

      const headerEl = e.currentTarget;
      headerEl.setPointerCapture(e.pointerId);

      const onPointerMove = (ev: PointerEvent) => {
        if (dragStartedRef.current) return;
        const dx = ev.screenX - dragStartPosRef.current.screenX;
        const dy = ev.screenY - dragStartPosRef.current.screenY;
        if (dx * dx + dy * dy > 9) {
          // Moved past 3px threshold — start the drag
          dragStartedRef.current = true;
          window.electronAPI?.startDrag(ev.screenX, ev.screenY);
        }
      };

      const onPointerUp = () => {
        headerEl.removeEventListener("pointermove", onPointerMove);
        headerEl.removeEventListener("pointerup", onPointerUp);
        dragCleanupRef.current = null;
        if (dragStartedRef.current) {
          dragStartedRef.current = false;
          window.electronAPI?.stopDrag();
        }
      };

      headerEl.addEventListener("pointermove", onPointerMove);
      headerEl.addEventListener("pointerup", onPointerUp);

      dragCleanupRef.current = () => {
        headerEl.removeEventListener("pointermove", onPointerMove);
        headerEl.removeEventListener("pointerup", onPointerUp);
        if (dragStartedRef.current) {
          dragStartedRef.current = false;
          window.electronAPI?.stopDrag();
        }
      };
    },
    [handleMaximize],
  );

  return (
    <header
      className="flex h-9 shrink-0 select-none items-center border-b border-border bg-background/80 backdrop-blur-sm"
      onPointerDown={handlePointerDown}
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
        onPointerDown={(e) => e.stopPropagation()}
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

      {/* Theme toggle */}
      <div
        className="flex h-full items-center"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <ThemeToggle />
      </div>

      {/* Right — window controls */}
      <div
        className="flex h-full"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        onPointerDown={(e) => e.stopPropagation()}
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

      {/* Registry dialog */}
      <HarnessRegistryDialog
        open={showRegistry}
        onClose={() => setShowRegistry(false)}
      />
    </header>
  );
}
