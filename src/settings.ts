import * as SecureStore from 'expo-secure-store';

const CLIENT_ID_KEY = 'entra_client_id';

/** Entra application (client) IDs are GUIDs. */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidClientId(value: string): boolean {
  return GUID.test(value.trim());
}

/** The client ID entered during onboarding. Stored only on this device. */
export function getClientId(): Promise<string | null> {
  return SecureStore.getItemAsync(CLIENT_ID_KEY);
}

export async function setClientId(value: string): Promise<void> {
  const id = value.trim().toLowerCase();
  if (!isValidClientId(id)) throw new Error('That does not look like an Application (client) ID');
  await SecureStore.setItemAsync(CLIENT_ID_KEY, id);
}

export function clearClientId(): Promise<void> {
  return SecureStore.deleteItemAsync(CLIENT_ID_KEY);
}
