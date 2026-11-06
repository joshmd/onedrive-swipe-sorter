/**
 * Phase 1 spike configuration. Edit these before the first run.
 */

/** Application (client) ID from your Entra app registration (public client, personal Microsoft accounts). */
export const CLIENT_ID = 'REPLACE-WITH-YOUR-CLIENT-ID';

/** URL scheme registered in app.json. The redirect URI to add in Entra is `swipesorter://auth`. */
export const URL_SCHEME = 'swipesorter';

/** Personal-account authority. Files.ReadWrite only; offline_access gives a refresh token. */
export const AUTHORITY = 'https://login.microsoftonline.com/consumers/v2.0';
export const SCOPES = ['Files.ReadWrite', 'offline_access', 'User.Read'];

/**
 * Hard-coded destination for the spike, relative to the drive root.
 * The folder must already exist. Use a throwaway test folder first.
 */
export const TARGET_FOLDER_PATH = 'Pictures/Swipe Sorter Test';
