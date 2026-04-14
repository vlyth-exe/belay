import * as https from "node:https";

const REGISTRY_URL = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface RegistryAgent {
  id: string;
  name: string;
  version: string;
  description: string;
  repository?: string;
  website?: string;
  authors?: string[];
  license?: string;
  icon?: string;
  distribution: Record<string, unknown>;
}

interface RegistryData {
  version: string;
  agents: RegistryAgent[];
}

let cachedRegistry: RegistryAgent[] | null = null;
let cacheTimestamp = 0;

function fetchJson(url: string): Promise<RegistryData> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse registry JSON: ${e}`));
          }
        });
      })
      .on("error", reject);
  });
}

export async function fetchRegistry(forceRefresh = false): Promise<RegistryAgent[]> {
  const now = Date.now();
  if (!forceRefresh && cachedRegistry && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedRegistry;
  }

  try {
    const data = await fetchJson(REGISTRY_URL);
    cachedRegistry = data.agents;
    cacheTimestamp = now;
    return cachedRegistry;
  } catch (e) {
    // Return stale cache if available
    if (cachedRegistry) return cachedRegistry;
    throw e;
  }
}
