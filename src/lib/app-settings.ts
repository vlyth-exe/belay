const STORAGE_KEY = "belay:app-settings";

// ── Terminal profile types ──────────────────────────────────────────

export interface TerminalProfile {
  id: string;
  name: string;
  /** Shell executable, e.g. "cmd.exe", "powershell.exe", "/bin/zsh", "wsl.exe" */
  shell: string;
  /** Arguments passed to the shell, e.g. ["-d", "Ubuntu"] */
  args: string[];
  /** Whether this profile launches inside WSL */
  isWsl: boolean;
  /** Specific WSL distribution name, e.g. "Ubuntu" */
  wslDistro?: string;
}

// ── App settings ────────────────────────────────────────────────────

interface AppSettings {
  notificationsEnabled: boolean;
  terminalProfiles: TerminalProfile[];
}

const defaults: AppSettings = {
  notificationsEnabled: true,
  terminalProfiles: [],
};

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return { ...defaults };
}

function save(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

// ── Notifications ───────────────────────────────────────────────────

export function getNotificationsEnabled(): boolean {
  return load().notificationsEnabled;
}

export function setNotificationsEnabled(enabled: boolean): void {
  const settings = load();
  settings.notificationsEnabled = enabled;
  save(settings);
}

// ── Terminal profiles ───────────────────────────────────────────────

/** Returns all user-defined terminal profiles. */
export function getTerminalProfiles(): TerminalProfile[] {
  return load().terminalProfiles ?? [];
}

/** Replace the entire terminal profiles list. */
export function setTerminalProfiles(profiles: TerminalProfile[]): void {
  const settings = load();
  settings.terminalProfiles = profiles;
  save(settings);
}

/** Add a single terminal profile. Returns the new profile. */
export function addTerminalProfile(
  profile: Omit<TerminalProfile, "id">,
): TerminalProfile {
  const profiles = getTerminalProfiles();
  const newProfile: TerminalProfile = {
    ...profile,
    id: `tp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };
  profiles.push(newProfile);
  setTerminalProfiles(profiles);
  return newProfile;
}

/** Update a terminal profile by id. */
export function updateTerminalProfile(
  id: string,
  updates: Partial<Omit<TerminalProfile, "id">>,
): void {
  const profiles = getTerminalProfiles();
  const idx = profiles.findIndex((p) => p.id === id);
  if (idx === -1) return;
  profiles[idx] = { ...profiles[idx], ...updates };
  setTerminalProfiles(profiles);
}

/** Remove a terminal profile by id. */
export function removeTerminalProfile(id: string): void {
  const profiles = getTerminalProfiles().filter((p) => p.id !== id);
  setTerminalProfiles(profiles);
}
