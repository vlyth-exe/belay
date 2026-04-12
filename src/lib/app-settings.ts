const STORAGE_KEY = "belay:app-settings";

interface AppSettings {
  notificationsEnabled: boolean;
}

const defaults: AppSettings = {
  notificationsEnabled: true,
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

export function getNotificationsEnabled(): boolean {
  return load().notificationsEnabled;
}

export function setNotificationsEnabled(enabled: boolean): void {
  const settings = load();
  settings.notificationsEnabled = enabled;
  save(settings);
}
