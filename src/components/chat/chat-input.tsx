import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import { ArrowUp, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AcpAvailableCommand, AcpSessionMode } from "@/types/acp";

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Slash commands exposed by the connected ACP agent. */
  slashCommands?: AcpAvailableCommand[];
  /** Agent session modes available for @ mention. */
  modes?: AcpSessionMode[];
  /** Called when a mode is selected via @ mention autocomplete. */
  onModeSelect?: (modeId: string) => void;
  /** Optional controls (e.g. agent/mode selectors) rendered inside the prompt box. */
  controls?: React.ReactNode;
}

const MAX_HEIGHT = 200;

// ── @ trigger detection ──────────────────────────────────────────────

/**
 * Walk backwards from the cursor to find an unambiguous `@` trigger.
 * Returns null if the cursor is not positioned right after `@query`
 * (no space between the query and the cursor).
 */
function findAtTrigger(
  text: string,
  cursorPos: number,
): { atIndex: number; query: string } | null {
  let i = cursorPos - 1;
  while (i >= 0 && text[i] !== " " && text[i] !== "\n" && text[i] !== "@") {
    i--;
  }
  if (i < 0 || text[i] !== "@") return null;
  // @ must be at start-of-string or preceded by whitespace
  if (
    i > 0 &&
    text[i - 1] !== " " &&
    text[i - 1] !== "\n" &&
    text[i - 1] !== "\t"
  ) {
    return null;
  }
  const query = text.slice(i + 1, cursorPos);
  if (query.includes(" ")) return null; // already completed
  return { atIndex: i, query };
}

// ── Menu state (discriminated union) ─────────────────────────────────

type MenuState =
  | { type: "hidden" }
  | { type: "slash"; items: AcpAvailableCommand[] }
  | { type: "at"; items: AcpSessionMode[]; atIndex: number };

// ── Component ────────────────────────────────────────────────────────

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Message Belay…",
  slashCommands = [],
  modes = [],
  onModeSelect,
  controls,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [cursorPosition, setCursorPosition] = useState<number | null>(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [menuDismissed, setMenuDismissed] = useState(false);
  const [prevItemCount, setPrevItemCount] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Derive autocomplete state from input + cursor ───────────────
  const menuState: MenuState = useMemo(() => {
    if (disabled || menuDismissed) return { type: "hidden" };

    // / slash commands — only at the very start of the input
    if (slashCommands.length > 0) {
      const match = value.match(/^\/([^\s]*)$/);
      if (match) {
        const filter = match[1].toLowerCase();
        const filtered = slashCommands.filter((cmd) =>
          cmd.name.toLowerCase().startsWith(filter),
        );
        if (filtered.length > 0) {
          return { type: "slash", items: filtered };
        }
      }
    }

    // @ mode mentions — anywhere a word starts with @
    if (modes.length > 0 && cursorPosition !== null) {
      const trigger = findAtTrigger(value, cursorPosition);
      if (trigger) {
        const filter = trigger.query.toLowerCase();
        const filtered = modes.filter(
          (m) =>
            m.name.toLowerCase().startsWith(filter) ||
            m.id.toLowerCase().startsWith(filter),
        );
        if (filtered.length > 0) {
          return {
            type: "at",
            items: filtered,
            atIndex: trigger.atIndex,
          };
        }
      }
    }

    return { type: "hidden" };
  }, [value, cursorPosition, slashCommands, modes, disabled, menuDismissed]);

  const itemCount = menuState.type === "hidden" ? 0 : menuState.items.length;

  // Reset selection when the filtered list length changes
  if (itemCount !== prevItemCount) {
    setPrevItemCount(itemCount);
    if (selectedIndex !== 0) setSelectedIndex(0);
  }

  // Scroll the selected item into view
  useEffect(() => {
    if (menuState.type === "hidden" || !menuRef.current) return;
    const selected = menuRef.current.querySelector("[data-selected]");
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, menuState.type]);

  // Keep textarea height in sync with content
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  // ── Select a slash command ──────────────────────────────────────
  const selectCommand = useCallback((cmd: AcpAvailableCommand) => {
    setValue(`/${cmd.name} `);
    setMenuDismissed(false);
    setSelectedIndex(0);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  // ── Select a mode from @ mention ────────────────────────────────
  const selectMode = useCallback(
    (mode: AcpSessionMode, atIndex: number) => {
      const cursor = cursorPosition ?? value.length;
      const before = value.slice(0, atIndex);
      const after = value.slice(cursor);
      const insertion = `@${mode.name} `;
      const newValue = `${before}${insertion}${after}`;
      const newCursor = before.length + insertion.length;

      setValue(newValue);
      setCursorPosition(newCursor);
      setMenuDismissed(false);
      setSelectedIndex(0);

      onModeSelect?.(mode.id);

      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.selectionStart = newCursor;
          el.selectionEnd = newCursor;
          el.focus();
        }
      });
    },
    [value, cursorPosition, onModeSelect],
  );

  // ── Select current highlighted item (generic) ───────────────────
  const selectCurrentItem = useCallback(() => {
    if (menuState.type === "slash") {
      selectCommand(menuState.items[selectedIndex]);
    } else if (menuState.type === "at") {
      selectMode(menuState.items[selectedIndex], menuState.atIndex);
    }
  }, [menuState, selectedIndex, selectCommand, selectMode]);

  // ── Keyboard handling ───────────────────────────────────────────
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (menuState.type !== "hidden") {
      const count = menuState.items.length;
      if (count > 0) {
        switch (e.key) {
          case "ArrowDown":
            e.preventDefault();
            setSelectedIndex((i) => (i < count - 1 ? i + 1 : 0));
            return;
          case "ArrowUp":
            e.preventDefault();
            setSelectedIndex((i) => (i > 0 ? i - 1 : count - 1));
            return;
          case "Tab":
          case "Enter":
            e.preventDefault();
            selectCurrentItem();
            return;
          case "Escape":
            e.preventDefault();
            setMenuDismissed(true);
            return;
        }
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    setCursorPosition(e.target.selectionStart ?? e.target.value.length);
    setMenuDismissed(false);
  }

  // Keep cursor position in sync on click / select / arrow keys
  function handleSelect() {
    const pos = textareaRef.current?.selectionStart ?? null;
    setCursorPosition(pos);
  }

  function send() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    setCursorPosition(0);
    setMenuDismissed(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  const canSend = !disabled && value.trim().length > 0;

  const hasSlash = slashCommands.length > 0;
  const hasModes = modes.length > 0;
  let dynamicPlaceholder = placeholder;
  if (hasSlash && hasModes) {
    dynamicPlaceholder = "Type / for commands, @ for modes…";
  } else if (hasSlash) {
    dynamicPlaceholder = "Type / for commands, or message…";
  } else if (hasModes) {
    dynamicPlaceholder = "Type @ for modes, or message…";
  }

  return (
    <div className="p-3">
      <div className="relative">
        {/* ── Autocomplete dropdown ──────────────────────────────── */}
        {menuState.type !== "hidden" && menuState.items.length > 0 && (
          <div
            ref={menuRef}
            className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
          >
            {/* ── Slash commands ────────────────────────────────── */}
            {menuState.type === "slash" && (
              <div className="p-1">
                {menuState.items.map((cmd, i) => (
                  <button
                    key={cmd.name}
                    type="button"
                    data-selected={i === selectedIndex ? "" : undefined}
                    onClick={() => selectCommand(cmd)}
                    onMouseEnter={() => setSelectedIndex(i)}
                    className={[
                      "flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors",
                      i === selectedIndex
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground",
                    ].join(" ")}
                  >
                    <span className="shrink-0 pt-px font-mono text-[13px] font-medium text-primary/80">
                      /{cmd.name}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] leading-snug">
                        {cmd.description}
                      </p>
                      {cmd.input?.hint && (
                        <p className="mt-0.5 text-[11px] italic text-muted-foreground/60">
                          {cmd.input.hint}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* ── Mode mentions (@) ──────────────────────────────── */}
            {menuState.type === "at" && (
              <div className="p-1">
                <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  Modes
                </div>
                {menuState.items.map((mode, i) => (
                  <button
                    key={mode.id}
                    type="button"
                    data-selected={i === selectedIndex ? "" : undefined}
                    onClick={() => selectMode(mode, menuState.atIndex)}
                    onMouseEnter={() => setSelectedIndex(i)}
                    className={[
                      "flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors",
                      i === selectedIndex
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground",
                    ].join(" ")}
                  >
                    <Zap className="mt-0.5 size-3.5 shrink-0 text-primary/80" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium leading-snug">
                        {mode.name}
                      </p>
                      {mode.description && (
                        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/70">
                          {mode.description}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Input row ──────────────────────────────────────────── */}
        <div className="rounded-lg border border-border/60 bg-muted/30 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/20">
          <div className="px-3 pt-2 pb-2">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onSelect={handleSelect}
              disabled={disabled}
              placeholder={dynamicPlaceholder}
              rows={1}
              className="max-h-50 min-h-6 w-full resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
            />
          </div>
          <div className="px-3 py-1.5">
            <div className="flex items-center gap-2">
              {controls}
              <div className="flex-1" />
              <Button
                size="icon-sm"
                onClick={send}
                disabled={!canSend}
                aria-label="Send message"
                className="shrink-0 rounded-lg"
              >
                <ArrowUp className="size-4" strokeWidth={2.5} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
