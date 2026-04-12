import { useState, useRef, useCallback, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Color palette ──────────────────────────────────────────────────────

const PRESET_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#a855f7", // purple
  "#ec4899", // pink
  "#78716c", // stone
  "#64748b", // slate
  "#06b6d4", // cyan
];

// ── Props ──────────────────────────────────────────────────────────────

interface GroupDialogProps {
  open: boolean;
  openKey: number;
  onClose: () => void;
  onSubmit: (data: { name: string; color: string }) => void;
  title: string;
  initialName?: string;
  initialColor?: string;
  submitLabel?: string;
}

// ── Inner form ─────────────────────────────────────────────────────────
// Extracted so the `openKey` can be used as a React key, causing a fresh
// mount (and thus fresh initial state) every time the dialog opens.

interface GroupFormProps {
  onClose: () => void;
  onSubmit: (data: { name: string; color: string }) => void;
  title: string;
  initialName: string;
  initialColor: string;
  submitLabel: string;
}

function GroupForm({
  onClose,
  onSubmit,
  title,
  initialName,
  initialColor,
  submitLabel,
}: GroupFormProps) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the name input on mount (safe — no setState)
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = name.trim();
      if (!trimmed) return;
      onSubmit({ name: trimmed, color });
      onClose();
    },
    [name, color, onSubmit, onClose],
  );

  return (
    <div className="w-80 rounded-xl border border-border bg-background shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-4">
        {/* Name input */}
        <label className="mb-3 block">
          <span className="mb-1.5 block text-[11px] font-medium text-muted-foreground uppercase">
            Name
          </span>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group name"
            className="w-full rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            maxLength={64}
          />
        </label>

        {/* Color picker */}
        <div className="mb-4">
          <span className="mb-2 block text-[11px] font-medium text-muted-foreground uppercase">
            Colour
          </span>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={[
                  "flex size-7 items-center justify-center rounded-full border-2 transition-all",
                  color === c
                    ? "border-foreground scale-110"
                    : "border-transparent hover:scale-105",
                ].join(" ")}
                style={{ backgroundColor: c }}
                aria-label={`Select colour ${c}`}
              >
                {color === c && (
                  <svg
                    className="size-3.5 text-white drop-shadow-sm"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-muted-foreground"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={!name.trim()}
            className="min-w-18"
          >
            {submitLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────

export function GroupDialog({
  open,
  openKey,
  onClose,
  onSubmit,
  title,
  initialName = "",
  initialColor = PRESET_COLORS[5],
  submitLabel = "Create",
}: GroupDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
    >
      {/* `openKey` as key ensures a fresh mount — and thus fresh state — each
          time the dialog opens. */}
      <GroupForm
        key={openKey}
        onClose={onClose}
        onSubmit={onSubmit}
        title={title}
        initialName={initialName}
        initialColor={initialColor}
        submitLabel={submitLabel}
      />
    </div>
  );
}
