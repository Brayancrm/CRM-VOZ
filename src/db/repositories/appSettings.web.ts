export async function getAppSetting(key: string): Promise<string | null> {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(key);
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, value);
}
