import { BrowserWindow } from "electron";
import { AcpClient } from "./acp-client.js";
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
  private permissionIndex = new Map<string, string>(); // requestId → agentId
  private mainWindow: BrowserWindow | null = null;

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  getConnectionState(agentId: string): string {
    return this.clients.get(agentId)?.client.state ?? "disconnected";
  }

  async connect(agentId: string): Promise<void> {
    const existing = this.clients.get(agentId);

    // If already connected and ready, no-op
    if (existing && existing.client.state === "ready") {
      return;
    }

    // If exists in a bad state, teardown and reconnect
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
    return managed.client.createSession(cwd);
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
