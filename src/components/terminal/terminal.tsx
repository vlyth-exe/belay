import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  id: string;
  cwd?: string;
  onClose: () => void;
}

function getTerminalTheme() {
  const isDark = document.documentElement.classList.contains("dark");

  if (isDark) {
    return {
      background: "#1a1a2e",
      foreground: "#e0e0e0",
      cursor: "#e0e0e0",
      cursorAccent: "#1a1a2e",
      selectionBackground: "rgba(255,255,255,0.15)",
      black: "#1a1a2e",
      red: "#ff6b6b",
      green: "#51cf66",
      yellow: "#fcc419",
      blue: "#339af0",
      magenta: "#cc5de8",
      cyan: "#22b8cf",
      white: "#e0e0e0",
      brightBlack: "#495057",
      brightRed: "#ff8787",
      brightGreen: "#69db7c",
      brightYellow: "#ffd43b",
      brightBlue: "#4dabf7",
      brightMagenta: "#da77f2",
      brightCyan: "#3bc9db",
      brightWhite: "#f8f9fa",
    };
  }

  return {
    background: "#fafafa",
    foreground: "#1a1a2e",
    cursor: "#1a1a2e",
    cursorAccent: "#fafafa",
    selectionBackground: "rgba(0,0,0,0.15)",
    black: "#1a1a2e",
    red: "#e03131",
    green: "#2b8a3e",
    yellow: "#e67700",
    blue: "#1864ab",
    magenta: "#9c36b5",
    cyan: "#0c8599",
    white: "#1a1a2e",
    brightBlack: "#495057",
    brightRed: "#c92a2a",
    brightGreen: "#2b8a3e",
    brightYellow: "#e67700",
    brightBlue: "#1864ab",
    brightMagenta: "#9c36b5",
    brightCyan: "#0c8599",
    brightWhite: "#f8f9fa",
  };
}

export function TerminalView({ id, cwd, onClose }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      theme: getTerminalTheme(),
      fontFamily:
        "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace",
      fontSize: 13,
      cursorBlink: true,
      scrollback: 10000,
    });

    terminalRef.current = terminal;

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(containerRef.current);
    fitAddon.fit();

    // ResizeObserver to handle container size changes
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(containerRef.current);

    // Listen for terminal input and send to PTY
    const dataDisposable = terminal.onData((data) => {
      window.electronAPI?.terminalWrite(id, data);
    });

    // Listen for terminal resize and notify PTY
    const resizeDisposable = terminal.onResize(() => {
      window.electronAPI?.terminalResize(id, terminal.cols, terminal.rows);
    });

    // Listen for data from PTY (main process)
    const unregisterDataListener = window.electronAPI?.onTerminalData(
      id,
      (data: string) => {
        terminal.write(data);
      },
    );

    // Listen for exit from PTY (main process)
    const unregisterExitListener = window.electronAPI?.onTerminalExit(
      id,
      () => {
        onClose();
      },
    );

    // Spawn the PTY process
    window.electronAPI?.terminalSpawn(id, cwd);

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      dataDisposable.dispose();
      resizeDisposable.dispose();
      unregisterDataListener?.();
      unregisterExitListener?.();
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [id, cwd, onClose]);

  return <div ref={containerRef} className="h-full w-full" />;
}

export default TerminalView;
