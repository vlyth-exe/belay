# Contributing to Belay

Thanks for your interest in contributing! This guide covers the architecture, internals, and development workflow you'll need to get started.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org) ≥ 20
- npm ≥ 10
- (Optional) [WSL](https://learn.microsoft.com/en-us/windows/wsl/) on Windows for Linux-only harnesses

### Install & Run

```bash
npm install
npm run dev:electron
```

`dev:electron` starts the Vite dev server and Electron concurrently. The renderer loads from `http://localhost:5173` in development.

For renderer-only work (no Electron):

```bash
npm run dev
```

### Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server (renderer only) |
| `npm run dev:electron` | Start Vite + Electron concurrently |
| `npm run build` | Type-check and build renderer + main process |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview the production build |
| `npm run package` | Build and package into an installer (NSIS on Windows) |

## Architecture

```
belay/
├── src/
│   ├── main/                   # Electron main process
│   │   ├── electron.ts         # Window creation, IPC registration
│   │   ├── preload.ts          # contextBridge API for the renderer
│   │   ├── persistence.ts      # Session message storage on disk
│   │   └── acp/                # Agent Client Protocol layer
│   │       ├── acp-client.ts   # Spawns harness subprocesses, SDK handshake
│   │       ├── client-methods.ts
│   │       ├── connection-manager.ts  # Multi-harness lifecycle manager
│   │       ├── harness-store.ts       # Installed harness config (~/.belay/)
│   │       └── registry.ts            # Remote harness registry fetcher
│   ├── components/
│   │   ├── chat/               # Chat UI (messages, input, tool calls, permissions)
│   │   ├── harness/            # Harness selector, registry browser, harness settings
│   │   ├── project/            # Sidebar, welcome screen, session groups
│   │   ├── settings/           # Settings dialog
│   │   ├── ui/                 # Shared UI primitives (shadcn)
│   │   ├── theme-toggle.tsx
│   │   └── title-bar.tsx
│   ├── hooks/
│   │   ├── use-acp.ts          # ACP connection, session, and update hooks
│   │   └── use-theme.ts        # Theme persistence and switching
│   ├── stores/
│   │   ├── project-store.tsx   # Projects, sessions, groups (localStorage)
│   │   └── message-store.tsx   # Per-session message cache + disk persistence
│   ├── types/                  # TypeScript interfaces (ACP, chat, project)
│   └── lib/                    # Utilities
├── public/                     # Static assets (icons, SVGs)
├── index.html                  # HTML entry point
├── vite.config.ts              # Vite + Tailwind + path aliases
├── components.json             # shadcn/ui configuration
└── package.json
```

### Process Model

Belay is an Electron app with two processes:

- **Main process** (`src/main/`) — Handles window management, IPC, filesystem access, and spawns harness subprocesses. Runs under Node.js with full system access.
- **Renderer process** (`src/components/`, `src/hooks/`, `src/stores/`) — The React UI. Has no direct Node.js access; communicates with the main process exclusively through the `contextBridge` API exposed in `preload.ts`.

### Data Flow

1. **Renderer → Main** — The React UI calls `window.electronAPI.*` methods exposed by the preload script. These are bridged via Electron's `contextBridge`.

2. **Main → Harness** — The `ConnectionManager` spawns each harness as a subprocess (`npx`, `uvx`, or a native binary) and communicates over stdin/stdout using the [ACP SDK](https://www.npmjs.com/package/@agentclientprotocol/sdk) (JSON-RPC over NDJSON).

3. **Streaming Updates** — Harness notifications (message chunks, tool calls, mode changes, permission requests) are forwarded from the main process to the renderer via `webContents.send()`.

4. **Persistence** — Session messages are serialized to JSON files in Electron's `userData/sessions/` directory. Project layout is persisted in `localStorage`.

### Key Modules

| Module | Responsibility |
|---|---|
| `acp-client.ts` | Spawns a single harness subprocess, performs the ACP SDK handshake (initialize → ready), and routes notifications. Handles process-tree cleanup on Windows (`taskkill /T /F`) and WSL path conversion. |
| `connection-manager.ts` | Manages multiple `AcpClient` instances keyed by `agentId`. Deduplicates concurrent connects, routes permission request responses, and tears down cleanly on disconnect. |
| `harness-store.ts` | Reads/writes `~/.belay/harnesses.json`. Resolves the correct distribution for the current platform (npx, uvx, binary) and stores WSL fallback config. |
| `registry.ts` | Fetches and caches the remote harness registry from the ACP CDN (1-hour TTL). |
| `persistence.ts` | Serializes/deserializes session messages to JSON files in `userData/sessions/`. Uses atomic writes (temp file + rename) to prevent corruption. |
| `project-store.tsx` | React context + reducer for projects, sessions, and groups. State is persisted to `localStorage` on every change. |
| `message-store.tsx` | React context providing a per-session message cache backed by the persistence layer. Deduplicates concurrent loads. |

## IPC Channels

All communication between the renderer and main process goes through these IPC channels, bridged in `preload.ts`:

| Channel | Direction | Description |
|---|---|---|
| `project:openDirectory` | Renderer → Main | Opens a native folder picker |
| `dialog:openFile` | Renderer → Main | Opens a native file picker |
| `acp:listRegistry` | Renderer → Main | Fetches the remote harness registry |
| `acp:listInstalled` | Renderer → Main | Lists locally installed harnesses |
| `acp:installHarness` | Renderer → Main | Installs a harness from the registry |
| `acp:uninstallHarness` | Renderer → Main | Uninstalls a harness |
| `acp:updateHarness` | Renderer → Main | Updates harness config (env, args, cwd, WSL settings) |
| `acp:connect` | Renderer → Main | Spawns and connects to a harness subprocess |
| `acp:disconnect` | Renderer → Main | Tears down a harness connection |
| `acp:getConnectionState` | Renderer → Main | Returns current connection state |
| `acp:createSession` | Renderer → Main | Creates a new ACP session |
| `acp:sendPrompt` | Renderer → Main | Sends a user message to the harness |
| `acp:cancelPrompt` | Renderer → Main | Cancels an in-flight prompt |
| `acp:setSessionMode` | Renderer → Main | Switches the harness's active mode |
| `acp:respondPermission` | Renderer → Main | Responds to a permission prompt |
| `acp:onUpdate` | Main → Renderer | Streams harness notifications |
| `acp:onPermissionRequest` | Main → Renderer | Shows permission approval UI |
| `acp:onConnectionStateChange` | Main → Renderer | Connection state updates |
| `acp:onError` | Main → Renderer | Harness error notifications |
| `session:loadMessages` | Renderer → Main | Load session messages from disk |
| `session:saveMessages` | Renderer → Main | Persist session messages to disk |
| `session:deleteMessages` | Renderer → Main | Delete session messages from disk |
| `window:minimize` | Renderer → Main | Minimize the window |
| `window:maximize` | Renderer → Main | Toggle maximize |
| `window:close` | Renderer → Main | Close the window |
| `window:isMaximized` | Renderer → Main | Query maximize state |
| `window:onMaximize` | Main → Renderer | Maximize state changed |
| `window:onUnmaximize` | Main → Renderer | Unmaximize state changed |

### Adding a New IPC Channel

1. Add an `ipcMain.handle(...)` or `ipcMain.on(...)` listener in `electron.ts`.
2. Expose the method in `preload.ts` via `contextBridge.exposeInMainWorld`.
3. Add the type declaration in `src/types/electron.d.ts`.
4. Use it from the renderer via `window.electronAPI.*`.

## Configuration

### Harness Store

Installed harnesses are stored in `~/.belay/harnesses.json`. Each entry includes:

```json
{
  "agentId": "my-harness",
  "name": "My Harness",
  "version": "1.0.0",
  "description": "A coding harness",
  "command": "npx",
  "args": ["@my-org/harness"],
  "env": { "API_KEY": "..." },
  "cwd": "/optional/working/directory",
  "useWsl": false,
  "wslDistro": "Ubuntu",
  "linuxCommand": "my-harness",
  "linuxArgs": [],
  "mcpServers": [
    {
      "name": "filesystem",
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "/path"]
    }
  ]
}
```

| Field | Description |
|---|---|
| `agentId` | Unique identifier from the ACP spec. Used as the key throughout Belay. |
| `command` | The spawn command (`npx`, `uvx`, or a path to a binary). |
| `args` | Arguments passed to the command. |
| `env` | Environment variables injected into the subprocess. |
| `cwd` | Working directory for the subprocess. Defaults to the project path. |
| `useWsl` | On Windows, run the command inside WSL instead of natively. |
| `wslDistro` | Optional WSL distribution name (e.g. `"Ubuntu"`). |
| `linuxCommand` / `linuxArgs` | Linux binary command stored for WSL fallback, even when a native Windows binary exists. |
| `mcpServers` | MCP server configurations passed to the harness during session creation. |

### Session Data

| Data | Location | Format |
|---|---|---|
| Project layout | Renderer `localStorage` | JSON (projects, sessions, groups, layout order) |
| Chat messages | `<userData>/sessions/<sessionId>.json` | JSON (block-based message model) |
| Harness capabilities | Renderer `localStorage` | JSON (modes, slash commands) |

### Message Model

Messages use a block-based model defined in `src/components/chat/types.ts`:

- **ThinkingBlock** — Agent's internal reasoning (collapsible in the UI).
- **TextBlock** — Visible text content.
- **ToolCallBlock** — A tool invocation with status tracking (`pending` → `in_progress` → `completed` / `failed`).

Each assistant turn is an ordered list of blocks that render sequentially, so a single response can interleave thinking, text, and tool calls.

## Themes

Belay ships with 14 built-in color themes defined in `src/index.css` as CSS custom properties. The active theme is toggled via `src/hooks/use-theme.ts` and persisted in `localStorage`.

| Light | Dark |
|---|---|
| Default Light | Default Dark |
| Catppuccin Latte | Catppuccin Mocha |
| Solarized Light | Solarized Dark |
| Gruvbox Light | Gruvbox Dark |
| Rosé Pine Dawn | Rosé Pine |
| — | Dracula |
| — | Nord |
| — | One Dark |
| — | Tokyo Night |
| — | Ayu Dark |

### Adding a Theme

1. Add a new CSS class (e.g. `.theme-my-theme`) in `src/index.css` that overrides the `:root` custom properties.
2. Add the theme name to the cycle in `src/hooks/use-theme.ts`.
3. Done — the theme toggle in the title bar will pick it up.

## Tech Stack

| Layer | Technology |
|---|---|
| Shell | [Electron](https://www.electronjs.org/) 41 |
| UI | [React](https://react.dev/) 19 + [TypeScript](https://www.typescriptlang.org/) 6 |
| Build | [Vite](https://vite.dev/) 8 |
| Styling | [Tailwind CSS](https://tailwindcss.com/) 4 |
| Components | [shadcn/ui](https://ui.shadcn.com/) (base-nova) |
| Icons | [Lucide React](https://lucide.dev/) |
| Protocol | [Agent Client Protocol](https://agentclientprotocol.com) via [@agentclientprotocol/sdk](https://www.npmjs.com/package/@agentclientprotocol/sdk) |
| Fonts | [Geist Variable](https://github.com/vercel/geist-font) |

## Code Style

- TypeScript throughout — strict mode enabled.
- ESLint with `typescript-eslint` recommended config + React hooks plugin.
- Components use the shadcn/ui pattern (Radix-style composition, `cva` for variants).
- Path aliases: `@/` maps to `src/`.