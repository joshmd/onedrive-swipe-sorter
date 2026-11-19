# OneDrive Swipe Sorter

Swipe through your OneDrive Camera Roll and file photos into folders. It scans Camera Roll (loose files plus Year > Month subfolders) and shows one photo at a time.

- **Four-way swipe map.** In settings (⚙), set each direction to *move to a folder*, *skip*, *delete* or *nothing*. Folders are picked by browsing or searching under Pictures. Camera Roll is never offered.
- **Undo** reverses the last 10 actions. A move is undone by moving the file back to where it came from.
- **Skip** (button, or a swipe set to skip) sends the photo to the back of the queue.
- **Grid view** (▦): thumbnails of the whole queue with − / + zoom and a month label as you scroll. Tap a photo to carry on sorting from there.
- **Order**: oldest or newest first, by date taken (file date if there isn't one). Undated photos go last.
- **No rescan on reopen.** The queue is saved on the phone as you sort, and reused if Camera Roll was scanned in the last 6 hours. Settings shows when it was last scanned and has **Rescan now**.
- **Delete** sends the file to the OneDrive recycle bin, but only once it can't be undone any more: when it drops off the undo list, when the app goes to the background, on rescan or on sign-out. Undo just cancels it, so the app never needs `Files.ReadWrite.All`, which recycle-bin restore would require. Pending deletes are saved on the phone and finished at next launch if the app was killed. Network failures are retried quietly. Anything else is retried up to 3 times, then the photo is left in Camera Roll and named in an error.

No backend. The client ID and tokens stay on the device in SecureStore. Photos only pass between the phone and Microsoft.

## One-off setup

1. **Check for re-uploads first.** On the OneDrive website, move one test photo out of Camera Roll and delete another. Check the next day that neither came back.
2. **Entra app registration** (in your free Entra tenant):
   - Supported account types: *Personal Microsoft accounts only*.
   - Platform: *Mobile and desktop applications*, redirect URI `swipesorter://auth`.
   - API permissions: Microsoft Graph, delegated: `Files.ReadWrite`, `User.Read`, `offline_access`.
   - No client secret is needed. *Allow public client flows* can stay off.
3. Copy the Application (client) ID. You paste it into the app on first launch. It is stored in SecureStore on the phone and never goes into the repo. "Change app registration" on the sign-in screen clears it, along with the saved sign-in.
4. Make sure your destination folders exist under Pictures. The app picks from existing folders and doesn't create new ones.

## Run on the Pixel

### From GitHub (no PC needed)

One-off: create an access token at expo.dev (account settings → Access tokens) and save it in this repo under Settings → Secrets and variables → Actions as `EXPO_TOKEN`.

Then: Actions tab → **Build Android APK** → **Run workflow**. When it finishes, the APK link is at the end of the "Build APK on EAS" step's log, and the build also shows on expo.dev. Open it on the Pixel and install over the existing app.

### From a PC

Easiest: a cloud build with EAS, which gives you an APK to install. No Android SDK needed.

```bash
npm install
npx eas-cli@latest login                                     # free Expo account
npx eas-cli@latest build --platform android --profile preview
```

The first run asks to create an EAS project and a signing keystore. Accept both. When the build finishes, open the link it prints on the Pixel, download the APK and install it. Android asks you to allow installs from your browser first.

Alternative with the Android SDK installed: `npx expo run:android` with the phone on USB.

The custom `swipesorter://` redirect needs a real build. Expo Go won't work.

## Checks

```bash
npx tsc --noEmit
npx expo export --platform android   # confirms the JS bundle builds
```

## Safety rules already in the code

- The Camera Roll folder itself is never renamed or moved, only files inside it (`moveItem` refuses the root ID).
- A name clash returns 409 `nameAlreadyExists`. The photo stays in the queue and nothing is overwritten.
- 429/503 responses back off using `Retry-After`.

## Pass criterion

Sort 100 real photos with no wrong moves, and see no re-uploads into Camera Roll the next day.

## Next

Pinned and recent folders in the picker, delta sync (so new uploads appear without a full rescan), pinch-to-zoom in the grid, a rename rule for name clashes, reminders and a session summary.
