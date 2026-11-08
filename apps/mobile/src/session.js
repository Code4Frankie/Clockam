import * as SecureStore from 'expo-secure-store';

const KEY = 'clockam.session';

export async function loadSession() {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export const saveSession = (s) => SecureStore.setItemAsync(KEY, JSON.stringify(s));
export const clearSession = () => SecureStore.deleteItemAsync(KEY).catch(() => {});
