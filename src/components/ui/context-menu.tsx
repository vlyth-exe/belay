import { useEffect, useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Clipboard } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContextMenuProps {
  x: number;
  y: number;
  canCopy: boolean;
  canPaste: boolean;
  onCopy: () => void;
  onPaste: () => void;
  onClose: () => void;
}

export function ContextMenu({
  x,
  y,
  canCopy,
  canPaste,
  onCopy,
  onPaste,
  onClose,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const handleCopy = useCallback(() => {
    onCopy();
    onClose();
  }, [onCopy, onClose]);

  const handlePaste = useCallback(() => {
    onPaste();
    onClose();
  }, [onPaste, onClose]);

  const menuWidth = 120;
  const menuHeight = 70;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 0;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 0;

  let left = x;
  let top = y;

  if (x + menuWidth + 4 > viewportWidth) {
    left = viewportWidth - menuWidth - 4;
  }

  if (y + menuHeight + 4 > viewportHeight) {
    top = viewportHeight - menuHeight - 4;
  }

  const menuElement = (
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[120px] rounded-lg border border-border bg-popover p-1 shadow-lg"
      style={{
        left: `${left}px`,
        top: `${top}px`,
      }}
    >
      <button
        type="button"
        disabled={!canCopy}
        onClick={handleCopy}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
          canCopy
            ? "text-muted-foreground hover:bg-muted hover:text-foreground"
            : "cursor-not-allowed text-muted-foreground/50"
        )}
      >
        <Copy className="size-3.5" />
        <span>Copy</span>
      </button>
      <button
        type="button"
        disabled={!canPaste}
        onClick={handlePaste}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
          canPaste
            ? "text-muted-foreground hover:bg-muted hover:text-foreground"
            : "cursor-not-allowed text-muted-foreground/50"
        )}
      >
        <Clipboard className="size-3.5" />
        <span>Paste</span>
      </button>
    </div>
  );

  if (!mounted) {
    return null;
  }

  return createPortal(menuElement, document.body);
}