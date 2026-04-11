import { useState, useEffect, useCallback } from "react";
import type { AcpAvailableCommand } from "@/types/acp";

type AcpConnectionState = "disconnected" | "initializing" | "ready" | "error";

interface HarnessConfig {
  agentId: string;
  name: string;
  version: string;
  description: string;
  icon?: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
}

interface AcpAgentManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  icon?: string;
  distribution: Record<string, unknown>;
}

const api = () => window.electronAPI;

export function useConnectionState(agentId: string) {
  const [state, setState] = useState<AcpConnectionState>("disconnected");

  useEffect(() => {
    api()?.acpGetConnectionState(agentId).then(setState);
    return api()?.acpOnConnectionStateChange(({ agentId: id, state: s }) => {
      if (id === agentId) setState(s);
    });
  }, [agentId]);

  return state;
}

export function useInstalledHarnesses() {
  const [harnesses, setHarnesses] = useState<HarnessConfig[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await api()?.acpListInstalled();
      if (!cancelled) setHarnesses(list ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    const list = await api()?.acpListInstalled();
    setHarnesses(list ?? []);
  }, []);

  return { harnesses, refresh };
}

export function useRegistryAgents() {
  const [agents, setAgents] = useState<AcpAgentManifest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api()?.acpListRegistry();
      setAgents(list ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch registry");
    } finally {
      setLoading(false);
    }
  }, []);

  return { agents, loading, error, fetch };
}

interface AcpUpdatePayload {
  type?: string;
  content?: string;
  [key: string]: unknown;
}

export function useAcpUpdates() {
  const [updates, setUpdates] = useState<AcpUpdatePayload[]>([]);

  useEffect(() => {
    return api()?.acpOnUpdate((update) => {
      setUpdates((prev) => [...prev, update as unknown as AcpUpdatePayload]);
    });
  }, []);

  const clearUpdates = useCallback(() => setUpdates([]), []);

  return { updates, clearUpdates };
}

export function useAcpError() {
  const [error, setError] = useState<{
    agentId: string;
    message: string;
    stderr: string;
  } | null>(null);

  useEffect(() => {
    return api()?.acpOnError((err) => {
      setError(err);
    });
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { error, clearError };
}

export function useSlashCommands(
  acpSessionId: string | null,
): AcpAvailableCommand[] {
  const [commands, setCommands] = useState<AcpAvailableCommand[]>([]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    (async () => {
      if (!acpSessionId) {
        setCommands([]);
        return;
      }

      cleanup = api()?.acpOnUpdate((raw: unknown) => {
        const notification = raw as Record<string, unknown>;
        // Filter: only process updates for our session
        if (notification.sessionId !== acpSessionId) return;

        const inner = notification.update as
          | Record<string, unknown>
          | undefined;
        if (!inner) return;

        const sessionUpdate = inner.sessionUpdate as string | undefined;
        if (sessionUpdate === "available_commands_update") {
          const cmds = inner.availableCommands as
            | AcpAvailableCommand[]
            | undefined;
          if (cmds) setCommands(cmds);
        }
      });
    })();

    return () => cleanup?.();
  }, [acpSessionId]);

  return commands;
}

export function useAcpActions() {
  const connect = useCallback(async (agentId: string) => {
    await api()?.acpConnect(agentId);
  }, []);

  const disconnect = useCallback(async (agentId: string) => {
    await api()?.acpDisconnect(agentId);
  }, []);

  const createSession = useCallback(async (agentId: string, cwd?: string) => {
    return api()?.acpCreateSession(agentId, cwd);
  }, []);

  const sendPrompt = useCallback(
    async (agentId: string, sessionId: string, content: string) => {
      await api()?.acpSendPrompt(agentId, sessionId, content);
    },
    [],
  );

  const cancelPrompt = useCallback(
    async (agentId: string, sessionId: string) => {
      await api()?.acpCancelPrompt(agentId, sessionId);
    },
    [],
  );

  const respondPermission = useCallback(
    async (requestId: string, optionId: string) => {
      await api()?.acpRespondPermission(requestId, optionId);
    },
    [],
  );

  return {
    connect,
    disconnect,
    createSession,
    sendPrompt,
    cancelPrompt,
    respondPermission,
  };
}
