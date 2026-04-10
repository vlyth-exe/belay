# ACP Integration Plan for Belay

## Overview

This document describes how to integrate the **Agent Client Protocol (ACP)** into Belay, enabling users to select and communicate with any ACP-compatible coding agent (Claude Agent, Gemini CLI, Cline, GitHub Copilot, etc.) through Belay's chat interface.

### What is ACP?

The **Agent Client Protocol** is a standardized JSON-RPC 2.0 protocol for communication between code editors/IDEs (**Clients**) and AI coding agents (**Agents**). It is analogous to LSP for language servers. Belay acts as an **ACP Client**, spawning agent subprocesses and communicating over stdio.

- **Protocol version:** 1
- **Transport:** JSON-RPC over stdio (agent subprocess), newline-delimited
- **Spec:** https://agentclientprotocol.com
- **TypeScript SDK:** `@agentclientprotocol/sdk`

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Agent** | An AI coding tool that implements the ACP agent side (e.g. Cline, Gemini CLI) |
| **Client** | The application that spawns and talks to agents — that's Belay |
| **Harness** | Our term for a configured/installed agent that a user can select |
| **Session** | A conversation thread with an agent (create via `session/new`) |
| **Prompt Turn** | One complete user→agent exchange (send via `session/prompt`, includes streaming updates) |
| **Registry** | The ACP Registry at `cdn.agentclientprotocol.com` listing available agents |

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Belay (Electron)                   │
│                                                       │
│  ┌────────────┐    IPC    ┌────────────────────────┐  │
│  │  Renderer   │ ◄──────► │     Main Process       │  │
│  │  (React)    │          │                        │  │
│  │             │          │  ┌──────────────────┐  │  │
│  │  Chat UI    │          │  │  ACP Client      │  │  │
│  │  Harness    │          │  │  Connection Mgr  │  │  │
│  │  Selector   │          │  └────────┬─────────┘  │  │
│  └────────────┘          │           │ stdio      │  │
│                           │  ┌────────▼─────────┐  │  │
│                           │  │ Agent subprocess  │  │  │
│                           │  │ (Cline, Gemini,   │  │  │
│                           │  │  Claude, etc.)    │  │  │
│                           │  └──────────────────┘  │  │
│                           └────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### Data Flow

1. **User selects a harness** → renderer sends IPC `acp:connect`
2. **Main process spawns agent** → subprocess communicates over stdio
3. **Main process sends `initialize`** → negotiates protocol version + capabilities
4. **User sends a chat message** → renderer sends IPC `acp:sendPrompt`
5. **Main process sends `session/prompt`** → agent processes and streams updates
6. **Agent sends `session/update`** notifications → main process forwards via IPC to renderer
7. **Renderer renders streaming text, tool calls, plans** in the chat UI

---

## Implementation Phases

### Phase 1: Install ACP SDK & Define Types

**Goal:** Bring in the SDK and define shared types for the renderer ↔ main process boundary.

**Tasks:**

- [ ] Install the SDK: `npm install @agentclientprotocol/sdk`
- [ ] Create `src/types/acp.ts` with shared types:
  - `AcpAgentManifest` — metadata from the registry (name, title, version, command, icon URL)
  - `AcpSessionInfo` — session ID, agent name, status
  - `AcpMessageChunk` — streaming text/tool updates from agents
  - `AcpConnectionState` — `"disconnected" | "initializing" | "ready" | "error"`
  - `AcpToolCallUpdate` — tool call status and content
  - `AcpPermissionRequest` — permission request from agent
- [ ] Extend `src/types/electron.d.ts` with new IPC channel types for ACP operations

**New/modified files:**

| File | Action |
|------|--------|
| `src/types/acp.ts` | New |
| `src/types/electron.d.ts` | Extend |

---

### Phase 2: Harness Registry & Discovery

**Goal:** Fetch the ACP registry so users can browse and select agents.

**Tasks:**

- [ ] Create `src/main/acp/registry.ts`:
  - `fetchRegistry(): Promise<AgentManifest[]>` — fetches from `https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json`
  - Caches results locally with a TTL (e.g. 1 hour)
  - Parses agent metadata: name, title, version, description, icon, distribution info
- [ ] Create `src/main/acp/harness-store.ts`:
  - Reads/writes a local config file (`~/.belay/harnesses.json` or via `electron-store`)
  - Tracks which agents are installed, their command paths, and env vars
  - Validates that agent binaries exist on disk
  - `listInstalled(): HarnessConfig[]`
  - `installHarness(manifest): void`
  - `uninstallHarness(agentId): void`
  - `getHarness(agentId): HarnessConfig | undefined`
- [ ] Add IPC handlers in main process:
  - `acp:listRegistry` — returns available agents from the registry
  - `acp:listInstalled` — returns locally configured harnesses
  - `acp:installHarness` — installs/configures a harness
  - `acp:uninstallHarness` — removes a harness from config

**New files:**

| File | Action |
|------|--------|
| `src/main/acp/registry.ts` | New |
| `src/main/acp/harness-store.ts` | New |

---

### Phase 3: ACP Client Connection Manager

**Goal:** Manage the lifecycle of spawning agents and communicating via stdio JSON-RPC.

**Tasks:**

- [ ] Create `src/main/acp/acp-client.ts`:
  - Uses `@agentclientprotocol/sdk`'s `ClientSideConnection` class
  - Spawns an agent subprocess with the configured command and args
  - Sends `initialize` with Belay's capabilities:
    ```json
    {
      "protocolVersion": 1,
      "clientCapabilities": {
        "fs": { "readTextFile": true, "writeTextFile": true },
        "terminal": true
      },
      "clientInfo": {
        "name": "belay",
        "title": "Belay",
        "version": "0.1.0"
      }
    }
    ```
  - Stores the agent's reported capabilities from `initialize` response
  - Handles `session/new` with the user's working directory
  - Sends `session/prompt` with user messages
  - Listens for `session/update` notifications:
    - `agent_message_chunk` — streaming text
    - `tool_call` — new tool invocation started
    - `tool_call_update` — tool status/content update
    - `plan` — agent's execution plan
  - Handles `session/request_permission` from agents — forwards to renderer
  - Handles `session/cancel` when user stops a generation
  - Manages subprocess lifecycle (spawn, kill, respawn)
  - Handles agent stderr for logging
- [ ] Create `src/main/acp/connection-manager.ts`:
  - Maps agent IDs to active `AcpClient` instances
  - Ensures at most one connection per agent
  - Handles cleanup on app quit
  - Emits events to renderer via `mainWindow.webContents.send()`
- [ ] Add IPC handlers for session lifecycle:
  - `acp:connect` — spawn and initialize an agent
  - `acp:disconnect` — kill agent subprocess
  - `acp:createSession` — call `session/new`
  - `acp:sendPrompt` — call `session/prompt`
  - `acp:cancelPrompt` — send `session/cancel`
  - `acp:respondPermission` — respond to permission requests

**New files:**

| File | Action |
|------|--------|
| `src/main/acp/acp-client.ts` | New |
| `src/main/acp/connection-manager.ts` | New |

---

### Phase 4: Harness Selector UI

**Goal:** A settings/sidebar panel where users browse, select, and configure an agent harness.

**Tasks:**

- [ ] Create `src/components/harness/harness-selector.tsx`:
  - Dropdown or sidebar panel showing installed harnesses
  - Each option shows: icon, name, version, connection status indicator (colored dot)
  - "Browse Registry" button to discover new agents
  - "Configure" button for env vars, working directory, MCP servers
  - Integrates with `use-acp.ts` hooks
- [ ] Create `src/components/harness/harness-registry-dialog.tsx`:
  - Modal/dialog that fetches registry via IPC
  - Grid or list of available agents
  - Each card shows: icon, name, description, version
  - "Install" button (validates path + saves config, or shows install instructions)
  - Search/filter capability
- [ ] Create `src/components/harness/harness-settings.tsx`:
  - Working directory picker (folder dialog)
  - Environment variables editor (key-value pairs, add/remove rows)
  - MCP server configuration (add/remove servers with name, command, args, env)
  - Agent-specific settings if applicable
- [ ] Create `src/hooks/use-acp.ts`:
  - `useConnectionState(): AcpConnectionState`
  - `useActiveSession(): { sessionId: string; agentName: string } | null`
  - `useInstalledHarnesses(): HarnessConfig[]`
  - `useRegistryAgents(): AgentManifest[]`
  - `useAcpActions()` — returns `{ connect, disconnect, sendPrompt, cancel }`
  - `useAcpUpdates()` — subscribes to streaming `session/update` events

**New files:**

| File | Action |
|------|--------|
| `src/components/harness/harness-selector.tsx` | New |
| `src/components/harness/harness-registry-dialog.tsx` | New |
| `src/components/harness/harness-settings.tsx` | New |
| `src/hooks/use-acp.ts` | New |

---

### Phase 5: Wire Chat UI to ACP

**Goal:** Replace the mock `getAIResponse` / `sendMessage` with real ACP calls, supporting streaming.

**Tasks:**

- [ ] Modify `src/components/chat/chat.tsx`:
  - Replace `getAIResponse()` with calls to `window.electronAPI.acpSendPrompt()`
  - Handle streaming updates: listen for `acp:onUpdate` IPC events that deliver `session/update` notifications
  - Append `agent_message_chunk` content to the current assistant message in real-time
  - Support tool call display (show tool name, status, expandable output)
  - Support agent plan display (show task list with statuses)
  - Support cancellation via `window.electronAPI.acpCancelPrompt()`
  - When no agent is connected, show harness selector in the empty state
- [ ] Update `src/main/preload.ts` to expose ACP APIs:
  - `acpConnect(agentId: string): Promise<void>`
  - `acpDisconnect(): Promise<void>`
  - `acpSendPrompt(sessionId: string, content: string): Promise<void>`
  - `acpCancelPrompt(sessionId: string): Promise<void>`
  - `acpListRegistry(): Promise<AgentManifest[]>`
  - `acpListInstalled(): Promise<HarnessConfig[]>`
  - `acpInstallHarness(manifest: AgentManifest): Promise<void>`
  - Event listeners: `acp:onUpdate`, `acp:onPermissionRequest`
- [ ] Update `src/components/chat/message-bubble.tsx`:
  - Render markdown in assistant messages (consider adding `react-markdown`)
  - Render tool call inline blocks
  - Render plan/task lists
- [ ] Add connection status indicator to title bar or chat header

**Modified files:**

| File | Action |
|------|--------|
| `src/components/chat/chat.tsx` | Modify |
| `src/main/preload.ts` | Modify |
| `src/types/electron.d.ts` | Modify |
| `src/components/chat/message-bubble.tsx` | Modify |
| `src/components/title-bar.tsx` | Modify (optional status indicator) |

---

### Phase 6: Permission & File System Handling

**Goal:** Implement the Client-side methods that agents can call (file system, terminal, permissions).

**Tasks:**

- [ ] Create `src/main/acp/client-methods.ts`:
  - `fs/read_text_file` — read a file from the workspace, confirm with user if outside cwd
  - `fs/write_text_file` — write a file, show diff to user for approval
  - `terminal/create` — create a pseudoterminal, stream output back
  - `terminal/output` — get terminal output
  - `terminal/wait_for_exit` — wait for command completion
  - `terminal/release` / `terminal/kill` — manage terminal lifecycle
  - `session/request_permission` — show dialog to user for tool call approval
- [ ] Create `src/components/chat/permission-dialog.tsx`:
  - Shows what the agent wants to do (read file, write file, run command)
  - "Allow" / "Deny" / "Allow Always for this session" buttons
  - Shows file diffs for write operations
  - Shows command details for terminal operations
- [ ] Create `src/components/chat/tool-call-display.tsx`:
  - Collapsible section showing tool name, arguments, status, and output
  - Status indicators: `pending` → `in_progress` → `completed` / `failed`
  - Displays tool output content (text, diffs, etc.)

**New files:**

| File | Action |
|------|--------|
| `src/main/acp/client-methods.ts` | New |
| `src/components/chat/permission-dialog.tsx` | New |
| `src/components/chat/tool-call-display.tsx` | New |

---

## Proposed File Structure

```
src/
├── main/
│   ├── electron.ts                    # Main process (updated with ACP IPC handlers)
│   ├── preload.ts                     # Preload (updated with ACP APIs)
│   └── acp/
│       ├── registry.ts                # Fetch & cache ACP registry
│       ├── harness-store.ts           # Manage installed harness configs
│       ├── acp-client.ts              # ClientSideConnection wrapper
│       ├── connection-manager.ts      # Multi-agent lifecycle management
│       └── client-methods.ts          # Handle agent→client requests (fs, terminal, perms)
├── components/
│   ├── chat/
│   │   ├── chat.tsx                   # Updated: streams from ACP
│   │   ├── chat-input.tsx             # Unchanged
│   │   ├── message-bubble.tsx         # Updated: render markdown + tool calls
│   │   ├── tool-call-display.tsx      # NEW: inline tool call rendering
│   │   └── permission-dialog.tsx      # NEW: approve/deny agent actions
│   ├── harness/
│   │   ├── harness-selector.tsx       # NEW: agent picker dropdown
│   │   ├── harness-registry-dialog.tsx # NEW: browse available agents
│   │   └── harness-settings.tsx       # NEW: configure agent + MCP servers
│   ├── ui/
│   │   └── button.tsx                 # Unchanged (shadcn)
│   └── title-bar.tsx                  # Updated: show agent connection status
├── hooks/
│   └── use-acp.ts                     # NEW: React hooks for ACP state
├── lib/
│   ├── ai.ts                          # Kept as fallback/mock when no agent connected
│   └── utils.ts                       # Unchanged
└── types/
    ├── acp.ts                         # NEW: ACP-specific types
    ├── chat.ts                        # Updated: add tool call + plan types
    └── electron.d.ts                  # Updated: ACP IPC channel declarations
```

---

## Key Design Decisions

### 1. Agent = "Harness"

Each ACP-compatible agent is a "harness" the user can select. The registry provides discoverability; the user picks one and configures it. This terminology separates the concept from "chat agents" or "AI models" — a harness is the full agent application (Cline, Gemini CLI, etc.).

### 2. Main Process Owns the Connection

Agent subprocesses are spawned in the **main process** (Node.js side), not the renderer. Communication flows:

```
Renderer → IPC → Main Process → stdio → Agent subprocess
```

This is necessary because:
- Spawning processes requires Node.js `child_process`
- stdio communication is a Node.js capability
- The main process can manage subprocess lifecycle across renderer reloads

### 3. Streaming via IPC Events

Agent `session/update` notifications are forwarded from main → renderer via `BrowserWindow.webContents.send()`, and the preload exposes them as event listeners on `window.electronAPI`.

### 4. MCP Server Passthrough

Belay can pass user-configured MCP server definitions to agents via the `session/new` params. This lets agents use tools the user has already set up, without Belay needing to implement those tools itself.

### 5. Graceful Degradation

If no agent is selected or connected:
- Fall back to the existing mock AI in `src/lib/ai.ts`
- Show an empty state prompting harness selection
- Chat UI still works, just with simulated responses

### 6. Permission Model

By default, agent tool calls that modify files or run commands should require user approval. The user can optionally "Allow Always" for a session to auto-approve.

---

## ACP Protocol Flow (Reference)

This is the standard ACP flow that Belay will implement:

```
1. Initialize
   Client → Agent:  initialize { protocolVersion: 1, clientCapabilities, clientInfo }
   Agent → Client:  { protocolVersion, agentCapabilities, agentInfo, authMethods }

2. Authenticate (if required)
   Client → Agent:  authenticate { ... }

3. Session Setup
   Client → Agent:  session/new { cwd, mcpServers }
   Agent → Client:  { sessionId }

4. Prompt Turn
   Client → Agent:  session/prompt { sessionId, prompt: [{type:"text", text:"..."}] }
   Agent → Client:  session/update { agent_message_chunk }  (streaming)
   Agent → Client:  session/update { tool_call }            (tool started)
   Agent → Client:  session/update { tool_call_update }     (tool progress)
   Agent → Client:  session/request_permission { ... }      (asks user)
   Client → Agent:  session/request_permission response      (user approves/denies)
   Agent → Client:  session/prompt response { stopReason }  (turn ends)

5. Cancel (optional)
   Client → Agent:  session/cancel { sessionId }
   Agent → Client:  session/prompt response { stopReason: "cancelled" }
```

---

## Dependencies to Add

| Package | Purpose |
|---------|---------|
| `@agentclientprotocol/sdk` | Official TypeScript ACP SDK (`ClientSideConnection`) |

Optional future dependencies:

| Package | Purpose |
|---------|---------|
| `react-markdown` | Render markdown in assistant messages |
| `remark-gfm` | GitHub-flavored markdown support |
| `electron-store` | Persistent config storage for harness settings |

---

## Recommended Implementation Order

| Order | Phase | Description | Dependencies |
|-------|-------|-------------|--------------|
| 1 | Phase 1 | Install SDK + define types | None |
| 2 | Phase 2 | Registry + harness store | Phase 1 |
| 3 | Phase 4 | Harness selector UI | Phase 2 (can use mock data initially) |
| 4 | Phase 3 | ACP client connection manager | Phase 1 |
| 5 | Phase 5 | Wire chat to ACP | Phase 3 + Phase 4 |
| 6 | Phase 6 | Permissions + file system | Phase 5 |

**Phases 3 and 4 can be done in parallel** since they are independent work streams (main process vs renderer).

---

## References

- **ACP Specification:** https://agentclientprotocol.com/protocol/overview
- **ACP Registry JSON:** https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json
- **ACP TypeScript SDK:** https://agentclientprotocol.com/libraries/typescript
- **ACP GitHub:** https://github.com/agentclientprotocol/agent-client-protocol
- **Available Agents:** https://agentclientprotocol.com/get-started/agents
- **ACP Clients List:** https://agentclientprotocol.com/get-started/clients