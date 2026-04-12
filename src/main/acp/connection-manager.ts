import { BrowserWindow } from "electron";
import { AcpClient, isWindows, windowsToWslPath } from "./acp-client.js";
import { getHarness } from "./harness-store.js";
import type { HarnessConfig } from "./harness-store.js";
import type {
  RequestPermissionRequest,
  RequestPermissionResponse,
} from "@agentclientprotocol/sdk";

interface ManagedClient {
  client: AcpClient;
  harness: HarnessConfig;
  pendingPermissions: Map<
    string,
    (response: RequestPermissionResponse) => void
  >;
  lastActivity: Date;
}

/** Manages multiple simultaneous ACP agent connections, keyed by agentId */
class ConnectionManager {
  private clients = new Map<string, ManagedClient>();
  private pendingConnects = new Map<string, Promise<void>>();
  private permissionIndex = new Map<string, string>(); // requestId → agentId
  private mainWindow: BrowserWindow | null = null;

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  getConnectionState(agentId: string): string {
    return this.clients.get(agentId)?.client.state ?? "disconnected";
  }

  async connect(agentId: string): Promise<void> {
    // If already connected and ready, no-op
    const existing = this.clients.get(agentId);
    if (existing && existing.client.state === "ready") {
      return;
    }

    // If a connect is already in flight for this agent, piggyback on it
    const pending = this.pendingConnects.get(agentId);
    if (pending) {
      return pending;
    }

    // Start a new connection and record the promise so concurrent callers
    // can await the same in-flight operation instead of spawning a second
    // process (which would tear down the first).
    const connectPromise = this._doConnect(agentId).finally(() => {
      this.pendingConnects.delete(agentId);
    });

    this.pendingConnects.set(agentId, connectPromise);
    return connectPromise;
  }

  /** Internal — called once per in-flight connect for a given agentId. */
  private async _doConnect(agentId: string): Promise<void> {
    // If exists in a bad state, teardown and reconnect
    const existing = this.clients.get(agentId);
    if (existing) {
      await this.teardownClient(agentId);
    }

    const harness = getHarness(agentId);
    if (!harness) throw new Error(`Harness not found: ${agentId}`);

    const client = new AcpClient();

    // Forward state changes to renderer
    client.onStateChange = (state: string) => {
      this.mainWindow?.webContents.send("acp:onConnectionStateChange", {
        agentId,
        state,
      });
    };

    // Forward session updates to renderer
    client.onUpdate = (update: unknown) => {
      this.mainWindow?.webContents.send("acp:onUpdate", update);
    };

    // Forward agent errors to renderer
    client.onError = (error: { message: string; stderr: string }) => {
      console.error(`[ACP ${agentId}] Agent error: ${error.message}`);
      this.mainWindow?.webContents.send("acp:onError", {
        agentId,
        message: error.message,
        stderr: error.stderr,
      });
    };

    // Forward permission requests to renderer
    client.onPermissionRequest = async (request: RequestPermissionRequest) => {
      return new Promise((resolve) => {
        const requestId = crypto.randomUUID();

        const managed = this.clients.get(agentId);
        if (managed) {
          managed.pendingPermissions.set(requestId, resolve);
          managed.lastActivity = new Date();
        }

        // Store in global permission index for routing
        this.permissionIndex.set(requestId, agentId);

        this.mainWindow?.webContents.send("acp:onPermissionRequest", {
          requestId,
          sessionId: request.sessionId,
          options: request.options,
        });
      });
    };

    const managed: ManagedClient = {
      client,
      harness,
      pendingPermissions: new Map(),
      lastActivity: new Date(),
    };

    this.clients.set(agentId, managed);

    try {
      await client.connect(harness);
    } catch (e) {
      // Clean up on failed connection
      this.clients.delete(agentId);
      throw e;
    }
  }

  respondPermission(requestId: string, optionId: string): void {
    const agentId = this.permissionIndex.get(requestId);
    if (!agentId) return;

    const managed = this.clients.get(agentId);
    if (!managed) {
      this.permissionIndex.delete(requestId);
      return;
    }

    const resolver = managed.pendingPermissions.get(requestId);
    if (!resolver) {
      this.permissionIndex.delete(requestId);
      return;
    }

    if (optionId === "cancelled") {
      resolver({ outcome: { outcome: "cancelled" } });
    } else {
      resolver({ outcome: { outcome: "selected", optionId } });
    }

    managed.pendingPermissions.delete(requestId);
    this.permissionIndex.delete(requestId);
  }

  async disconnect(agentId: string): Promise<void> {
    await this.teardownClient(agentId);
  }

  async createSession(
    agentId: string,
    cwd?: string,
  ): Promise<{
    sessionId: string;
    modes?: {
      currentModeId: string;
      availableModes: Array<{
        id: string;
        name: string;
        description?: string | null;
      }>;
    } | null;
  }> {
    const managed = this.clients.get(agentId);
    if (!managed) throw new Error(`Not connected to agent: ${agentId}`);
    managed.lastActivity = new Date();

    // Convert cwd to a WSL-compatible path when the agent is running
    // inside Windows Subsystem for Linux so the agent receives a path
    // it can actually resolve (e.g. /mnt/d/Dev/belay).
    const effectiveCwd =
      cwd && isWindows && managed.harness.useWsl ? windowsToWslPath(cwd) : cwd;

    return managed.client.createSession(effectiveCwd);
  }

  async sendPrompt(
    agentId: string,
    sessionId: string,
    content: string,
  ): Promise<void> {
    const managed = this.clients.get(agentId);
    if (!managed) throw new Error(`Not connected to agent: ${agentId}`);
    managed.lastActivity = new Date();
    return managed.client.sendPrompt(sessionId, content);
  }

  async cancelPrompt(agentId: string, sessionId: string): Promise<void> {
    const managed = this.clients.get(agentId);
    if (!managed) throw new Error(`Not connected to agent: ${agentId}`);
    managed.lastActivity = new Date();
    return managed.client.cancelPrompt(sessionId);
  }

  async setSessionMode(
    agentId: string,
    sessionId: string,
    modeId: string,
  ): Promise<void> {
    const managed = this.clients.get(agentId);
    if (!managed) throw new Error(`Not connected to agent: ${agentId}`);
    managed.lastActivity = new Date();
    return managed.client.setSessionMode(sessionId, modeId);
  }

  private async teardownClient(agentId: string): Promise<void> {
    const managed = this.clients.get(agentId);
    if (!managed) return;

    for (const [requestId, resolver] of managed.pendingPermissions) {
      resolver({ outcome: { outcome: "cancelled" } });
      this.permissionIndex.delete(requestId);
    }
    managed.pendingPermissions.clear();

    // Clear callbacks before disconnecting to prevent stale notifications
    // from reaching the renderer.  Without this, a concurrent connect()
    // can create a new client that sends "ready", only for the old client's
    // disconnect() to subsequently fire "disconnected" — causing the
    // renderer to reset all session state.
    managed.client.onStateChange = null;
    managed.client.onUpdate = null;
    managed.client.onError = null;
    managed.client.onPermissionRequest = null;

    await managed.client.disconnect();
    this.clients.delete(agentId);
  }

  async dispose(): Promise<void> {
    const agentIds = [...this.clients.keys()];
    await Promise.all(agentIds.map((id) => this.teardownClient(id)));
  }
}

// Singleton
export const connectionManager = new ConnectionManager();
