import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { AUTHORITY, CLIENT_ID, SCOPES, URL_SCHEME } from './config';

WebBrowser.maybeCompleteAuthSession();

const REFRESH_KEY = 'ms_refresh_token';

type Tokens = { accessToken: string; expiresAt: number; refreshToken?: string };

let current: Tokens | null = null;
let discoveryCache: AuthSession.DiscoveryDocument | null = null;

export const redirectUri = AuthSession.makeRedirectUri({ scheme: URL_SCHEME, path: 'auth' });

function store(res: AuthSession.TokenResponse) {
  current = {
    accessToken: res.accessToken,
    expiresAt: Date.now() + (res.expiresIn ?? 3600) * 1000,
    refreshToken: res.refreshToken ?? current?.refreshToken,
  };
  if (current.refreshToken) SecureStore.setItemAsync(REFRESH_KEY, current.refreshToken);
}

async function refresh(refreshToken: string): Promise<boolean> {
  if (!discoveryCache) discoveryCache = await AuthSession.fetchDiscoveryAsync(AUTHORITY);
  try {
    const res = await AuthSession.refreshAsync(
      { clientId: CLIENT_ID, refreshToken, scopes: SCOPES },
      discoveryCache,
    );
    store(res);
    return true;
  } catch {
    return false;
  }
}

/** Returns a valid access token, refreshing if it expires within a minute. */
export async function getAccessToken(): Promise<string> {
  if (current && current.expiresAt - 60_000 > Date.now()) return current.accessToken;
  const rt = current?.refreshToken ?? (await SecureStore.getItemAsync(REFRESH_KEY));
  if (rt && (await refresh(rt))) return current!.accessToken;
  throw new Error('Not signed in');
}

export async function signOut() {
  current = null;
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

/** Sign-in hook: PKCE authorisation-code flow, no client secret. */
export function useMicrosoftSignIn() {
  const discovery = AuthSession.useAutoDiscovery(AUTHORITY);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    { clientId: CLIENT_ID, scopes: SCOPES, redirectUri, usePKCE: true },
    discovery,
  );

  // Try a silent sign-in from the stored refresh token.
  useEffect(() => {
    getAccessToken().then(
      () => setSignedIn(true),
      () => setSignedIn(false),
    );
  }, []);

  useEffect(() => {
    if (discovery) discoveryCache = discovery;
    if (response?.type === 'error') setError(response.error?.message ?? 'Sign-in failed');
    if (response?.type !== 'success' || !discovery || !request?.codeVerifier) return;
    AuthSession.exchangeCodeAsync(
      {
        clientId: CLIENT_ID,
        code: response.params.code,
        redirectUri,
        extraParams: { code_verifier: request.codeVerifier },
      },
      discovery,
    )
      .then((res) => {
        store(res);
        setSignedIn(true);
      })
      .catch((e) => setError(String(e)));
  }, [response, discovery, request]);

  const signIn = useCallback(() => {
    setError(null);
    promptAsync();
  }, [promptAsync]);

  const doSignOut = useCallback(async () => {
    await signOut();
    setSignedIn(false);
  }, []);

  return { ready: !!request, signedIn, error, signIn, signOut: doSignOut };
}
