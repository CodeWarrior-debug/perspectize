# Add from iPhone: rebuilding the Shortcut

Perspectize's iPhone share sheet entry is an Apple Shortcut, which lives in iCloud, not in this repo. This is how to rebuild it. The Settings help (`ShortcutHelp.svelte`) shows an install button once `IOS_SHORTCUT_URL` in `frontend/src/lib/utils/shortcutLink.ts` holds its link.

## Build it

On an iPhone or Mac signed into the owner's iCloud account, in the Shortcuts app, create a shortcut named **Add to Perspectize** with these actions in order:

1. **Receive** input from **Share Sheet**. Accept **URLs** and **Text** (turn on "Show in Share Sheet"). If there is no input, **Continue**.
2. **Get URLs from** *Shortcut Input*. (Text shared from an app that wraps the link in a sentence still yields its link.)
3. **If** *URLs* **has any value**: set variable `link` to the first item. **Otherwise** set `link` to *Shortcut Input* (this covers a Bible reference shared as text, which `/add` also understands).
4. **URL Encode** `link`.
5. **Open URLs**: `https://app.perspectize.com/add?url=<URL Encoded text>` (use the same production address as `PRODUCTION_BASE` in `extension/src/baseUrl.ts`).

In the shortcut's settings, set the icon, then **Share, Copy iCloud Link**.

## Publish it

1. Paste the iCloud link into `IOS_SHORTCUT_URL` in `frontend/src/lib/utils/shortcutLink.ts`.
2. Merge. The "Add the Shortcut" button then appears under Settings, General.

## Check it

Open Safari on a YouTube page, tap Share, choose "Add to Perspectize". Safari opens `/add` with the link filled in and the type detected. A signed-out user sees "Sign in to add" with the link kept.

## Notes

- The Shortcut targets production only; testing against a local build needs a duplicate pointing at it.
- Sign-in uses the normal web session in Safari. A longer Clerk session (30 days rolling) means it rarely asks.
