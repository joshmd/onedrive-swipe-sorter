# OneDrive Swipe Sorter (Phase 1 spike)

Swipe through your OneDrive Camera Roll and file photos into folders. This is the Phase 1 spike from the feasibility brief. It signs in, lists Camera Roll (loose files plus Year > Month subfolders), shows one thumbnail at a time, and moves the photo to one hard-coded folder when you swipe right. Any other swipe springs back.

No backend. The client ID and tokens stay on the device in SecureStore. Photos only pass between the phone and Microsoft.

## One-off setup

1. **Do Phase 0 first.** In Graph Explorer, move one test photo out of Camera Roll and delete another. Check the next day that neither came back.
2. **Entra app registration** (in your free Entra tenant):
   - Supported account types: *Personal Microsoft accounts only*.
   - Platform: *Mobile and desktop applications*, redirect URI `swipesorter://auth`.
   - API permissions: Microsoft Graph, delegated: `Files.ReadWrite`, `User.Read`, `offline_access`.
   - Leave *Allow public client flows* on. No client secret is needed.
3. Copy the Application (client) ID. You paste it into the app on first launch. It is stored in SecureStore on the phone and never goes into the repo. "Change app registration" on the sign-in screen clears it, along with the saved sign-in.
4. Create the test folder in OneDrive: `Pictures/Swipe Sorter Test` (or change `TARGET_FOLDER_PATH`).

## Run on the Pixel

The custom `swipesorter://` redirect needs a development build. Expo Go won't do.

```bash
npm install
npx expo run:android        # USB/ADB install to the Pixel (needs Android SDK)
# or: npx eas-cli@latest build --profile development --platform android
```

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

## Next (Phase 2)

Configurable four-way swipe map, pinned/recent/search folder picker under Pictures, a 10-step undo stack, delta sync, and a rename rule for clashes.
