/**
 * App-wide constants. Nothing account-specific lives here: the Entra client ID
 * is entered on the phone during onboarding and kept in SecureStore.
 */

/** URL scheme registered in app.json. The redirect URI to add in Entra is `swipesorter://auth`. */
export const URL_SCHEME = 'swipesorter';

/** Personal-account authority. Files.ReadWrite only; offline_access gives a refresh token. */
export const AUTHORITY = 'https://login.microsoftonline.com/consumers/v2.0';
export const SCOPES = ['Files.ReadWrite', 'offline_access', 'User.Read'];
