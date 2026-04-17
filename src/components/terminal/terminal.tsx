import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { ContextMenu } from "@/components/ui/context-menu";

import "@xterm/xterm/css/xterm.css";

// ── CSS custom property → hex colour resolution ─────────────────────

/**
 * Read a CSS custom property from `:root` and return the value as
 * `#rrggbb`.  Reads the raw variable value from document.documentElement
 * and uses a canvas 2D context to normalise any colour format (oklch,
 * hsl, hex, named colours…) to a hex string.
 *
 * The previous approach set `color: var(…)` on a hidden probe element and
 * parsed getComputedStyle().color with an `rgb(…)` regex.  That breaks
 * for the default light/dark themes whose CSS vars use `oklch()` — modern
 * Chromium (111+) preserves the originating colour space in computed
 * values, so getComputedStyle returns `oklch(0.145 0 0)` instead of
 * `rgb(37, 37, 37)`, and the regex never matches.
 *
 * The canvas 2D context's fillStyle setter accepts every valid CSS
 * <color> and the getter always normalises to `#rrggbb` (opaque) or
 * `rgba(…)` (semi-transparent), regardless of input format.
 */
function cssVarToHex(name: string): string {
  if (typeof document === "undefined") return "#000000";

  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  if (!raw) return "#000000";

  // Already a 6-digit hex colour — return as-is.
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw;

  // Canvas 2D normalises any CSS colour to #rrggbb / rgba(…).
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "#000000";

  ctx.fillStyle = "#000000";
  ctx.fillStyle = raw;
  const normalised = ctx.fillStyle;

  // Opaque — already #rrggbb.
  if (/^#[0-9a-fA-F]{6}$/.test(normalised)) return normalised;

  // Semi-transparent — strip alpha, convert RGB to hex.
  const match = normalised.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return "#000000";

  const r = parseInt(match[1]).toString(16).padStart(2, "0");
  const g = parseInt(match[2]).toString(16).padStart(2, "0");
  const b = parseInt(match[3]).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

/** Convert `#rrggbb` + alpha → `rgba(r, g, b, a)`. */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Build an xterm.js theme by mapping the app's CSS custom properties to
 * ANSI colour slots.  Because it reads live computed values from the DOM,
 * it works with **every** current and future theme — no manual mapping
 * required.
 *
 * Colour mapping:
 *
 * | ANSI slot       | CSS variable      | Rationale                              |
 * |-----------------|-------------------|----------------------------------------|
 * | background      | --background      | matches the app surface                |
 * | foreground      | --foreground      | matches the app text                   |
 * | cursor          | --foreground      | visible against background              |
 * | black           | --card            | slightly darker than bg                 |
 * | red             | --destructive     | semantic "error" colour                 |
 * | green           | --chart-3         | green-ish accent in most themes         |
 * | yellow          | --chart-4         | warm accent in most themes              |
 * | blue            | --primary         | main accent colour                     |
 * | magenta         | --chart-2         | purple-ish accent in most themes        |
 * | cyan            | --sidebar-ring    | cool secondary accent                  |
 * | white           | --muted-foreground| mid-grey, good for "white" in ANSI ctx |
 * | bright variants | chart/ring vars   | the vivid accent colours               |
 */
/**
 * Standard ANSI palettes for the default light/dark themes.  These themes
 * use achromatic `oklch(L 0 0)` chart colours (pure grey), so the CSS-var
 * mapping produces a completely colourless terminal.  We keep bg/fg/cursor
 * from the CSS vars but inject proper chromatic ANSI colours instead.
 */
/**
 * Complete xterm theme for the default light mode.
 *
 * Background/foreground are hardcoded because the default light/dark
 * themes define their CSS vars as oklch() values (e.g. oklch(1 0 0))
 * which neither the canvas 2D context nor the probe-element approach
 * can reliably resolve to hex in all Chromium versions.  oklch(1 0 0)
 * = #ffffff (white), oklch(0.145 0 0) ≈ #0a0a0a (near-black).
 */
const DEFAULT_LIGHT_THEME = {
  background: "#ffffff",
  foreground: "#0a0a0a",
  cursor: "#0a0a0a",
  cursorAccent: "#ffffff",
  selectionBackground: "rgba(10, 10, 10, 0.2)",
  selectionInactiveBackground: "rgba(10, 10, 10, 0.1)",
  black: "#e1e2e7",
  red: "#d20f39",
  green: "#2b8a3e",
  yellow: "#e67700",
  blue: "#1864ab",
  magenta: "#9c36b5",
  cyan: "#0c8599",
  white: "#4c4f69",
  brightBlack: "#6c6f85",
  brightRed: "#e03131",
  brightGreen: "#40c057",
  brightYellow: "#fab005",
  brightBlue: "#1c7ed6",
  brightMagenta: "#ae3ec9",
  brightCyan: "#15aabf",
  brightWhite: "#1e1e2e",
};

/** oklch(0.145 0 0) ≈ #0a0a0a, oklch(0.985 0 0) ≈ #fafafa */
const DEFAULT_DARK_THEME = {
  background: "#0a0a0a",
  foreground: "#fafafa",
  cursor: "#fafafa",
  cursorAccent: "#0a0a0a",
  selectionBackground: "rgba(250, 250, 250, 0.2)",
  selectionInactiveBackground: "rgba(250, 250, 250, 0.1)",
  black: "#1e1e2e",
  red: "#f38ba8",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  blue: "#89b4fa",
  magenta: "#cba6f7",
  cyan: "#94e2d5",
  white: "#cdd6f4",
  brightBlack: "#45475a",
  brightRed: "#f38ba8",
  brightGreen: "#a6e3a1",
  brightYellow: "#f9e2af",
  brightBlue: "#89b4fa",
  brightMagenta: "#cba6f7",
  brightCyan: "#94e2d5",
  brightWhite: "#ffffff",
};

function buildXtermTheme() {
  // Named themes (catppuccin-*, dracula, nord, …) carry chromatic chart
  // colours that map cleanly to ANSI slots via CSS custom properties.
  // The default light/dark themes use achromatic oklch(L 0 0) chart
  // colours (pure grey), AND their CSS vars are in oklch() format which
  // cssVarToHex cannot resolve.  Return fully hardcoded themes for those.
  const hasNamedTheme = [...document.documentElement.classList].some((c) =>
    c.startsWith("theme-"),
  );

  if (!hasNamedTheme) {
    const isDark = document.documentElement.classList.contains("dark");
    return isDark ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME;
  }

  // Named theme — map CSS vars to ANSI slots.
  const background = cssVarToHex("--background");
  const foreground = cssVarToHex("--foreground");
  const card = cssVarToHex("--card");
  const primary = cssVarToHex("--primary");
  const destructive = cssVarToHex("--destructive");
  const muted = cssVarToHex("--muted");
  const mutedFg = cssVarToHex("--muted-foreground");
  const chart1 = cssVarToHex("--chart-1");
  const chart2 = cssVarToHex("--chart-2");
  const chart3 = cssVarToHex("--chart-3");
  const chart4 = cssVarToHex("--chart-4");
  const chart5 = cssVarToHex("--chart-5");
  const ring = cssVarToHex("--ring");
  const sidebarRing = cssVarToHex("--sidebar-ring");

  return {
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: hexToRgba(foreground, 0.2),
    selectionInactiveBackground: hexToRgba(foreground, 0.1),

    // Standard ANSI (0–7)
    black: card,
    red: destructive,
    green: chart3,
    yellow: chart4,
    blue: primary,
    magenta: chart2,
    cyan: sidebarRing,
    white: mutedFg,

    // Bright ANSI (8–15)
    brightBlack: muted,
    brightRed: chart5,
    brightGreen: chart3,
    brightYellow: chart4,
    brightBlue: chart1,
    brightMagenta: chart2,
    brightCyan: ring,
    brightWhite: foreground,
  };
}

// ── Props ───────────────────────────────────────────────────────────

interface TerminalProps {
  id: string;
  cwd?: string;
  onClose: () => void;
  spawnOptions?: {
    shell?: string;
    args?: string[];
    isWsl?: boolean;
    wslDistro?: string;
  };
}

// ── Component ───────────────────────────────────────────────────────

export function TerminalView({
  id,
  cwd,
  onClose,
  spawnOptions,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [clipboardHasText, setClipboardHasText] = useState(false);
  // Ref so the PTY-exit handler always calls the latest onClose without
  // adding it to the effect dependency array (which would destroy and
  // recreate every terminal on every render).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const handleCopy = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const selection = terminal.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection);
    }
  }, []);

  const handlePaste = useCallback(() => {
    navigator.clipboard.readText().then((text) => {
      if (text) {
        window.electronAPI?.terminalWrite(id, text);
      }
    });
  }, [id]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const terminal = terminalRef.current;
    const selection = terminal?.getSelection() ?? "";
    setHasSelection(selection.length > 0);
    navigator.clipboard.readText().then((text) => {
      setClipboardHasText(text && text.length > 0);
    });
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ── Create terminal ────────────────────────────────────────────
    const terminal = new Terminal({
      theme: buildXtermTheme(),
      fontFamily:
        "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace",
      fontSize: 13,
      cursorBlink: true,
      scrollback: 10000,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    fitAddon.fit();

    terminalRef.current = terminal;

    // ── Keep terminal sized to its container ───────────────────────
    // Guard: skip fit() when the container is hidden (display: none)
    // — dimensions are 0 and xterm can't compute cols/rows. The
    // observer fires again with real dimensions when the tab reappears.
    const resizeObserver = new ResizeObserver(() => {
      if (container.offsetWidth > 0 && container.offsetHeight > 0) {
        fitAddon.fit();
      }
    });
    resizeObserver.observe(container);

    // ── Keyboard shortcuts (copy/paste) ───────────────────────────
    // Ctrl+Shift+C = copy selection (Ctrl+C sends SIGINT to shell)
    // Ctrl+Shift+V = paste from clipboard
    const handleKeyDown = (event: KeyboardEvent) => {
      // Copy: Ctrl+Shift+C
      if (event.ctrlKey && event.shiftKey && event.key === "C") {
        event.preventDefault();
        const selection = terminal.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
        }
        return;
      }

      // Paste: Ctrl+Shift+V
      if (event.ctrlKey && event.shiftKey && event.key === "V") {
        event.preventDefault();
        navigator.clipboard.readText().then((text) => {
          if (text) {
            // Send pasted text directly to PTY
            window.electronAPI?.terminalWrite(id, text);
          }
        });
        return;
      }
    };

    container.addEventListener("keydown", handleKeyDown);

    // ── Terminal input → PTY ───────────────────────────────────────
    const dataDisposable = terminal.onData((data) => {
      window.electronAPI?.terminalWrite(id, data);
    });

    // ── Terminal resize → PTY ──────────────────────────────────────
    const resizeDisposable = terminal.onResize(() => {
      window.electronAPI?.terminalResize(id, terminal.cols, terminal.rows);
    });

    // ── PTY output → terminal ──────────────────────────────────────
    const unregisterData = window.electronAPI?.onTerminalData(
      id,
      (data: string) => {
        terminal.write(data);
      },
    );

    // ── PTY exit → close ───────────────────────────────────────────
    const unregisterExit = window.electronAPI?.onTerminalExit(id, () => {
      onCloseRef.current();
    });

    // ── Spawn the PTY process ──────────────────────────────────────
    window.electronAPI?.terminalSpawn(id, cwd, spawnOptions);

    // ── React to theme changes via MutationObserver ────────────────
    //
    // We watch `class` mutations on <html> directly instead of relying
    // on React state + useEffect.  The app's useTheme hook updates the
    // DOM classes in its *own* useEffect — which fires in the same
    // batch as this component's effects, with no guaranteed ordering.
    // Reading CSS vars in a useEffect can therefore race and read the
    // *previous* theme's values.  MutationObserver fires only after the
    // DOM has actually changed, so we always read the correct colours.
    const themeObserver = new MutationObserver(() => {
      terminal.options.theme = buildXtermTheme();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // ── Cleanup ────────────────────────────────────────────────────
    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      themeObserver.disconnect();
      resizeObserver.disconnect();
      dataDisposable.dispose();
      resizeDisposable.dispose();
      unregisterData?.();
      unregisterExit?.();
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [id, cwd, spawnOptions]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      onContextMenu={handleContextMenu}
    >
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          canCopy={hasSelection}
          canPaste={clipboardHasText}
          onCopy={handleCopy}
          onPaste={handlePaste}
          onClose={handleCloseContextMenu}
        />
      )}
    </div>
  );
}

export default TerminalView;
