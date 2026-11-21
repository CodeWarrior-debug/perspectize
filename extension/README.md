# Add to Perspectize (Chrome extension)

A launcher. It reads the address and title of the tab you are on and opens Perspectize's `/add` page in a small popup window. The add form, sign-in and everything else are the web app's, so the extension holds no login and changes to the form never need a Chrome Web Store review.

Ways to use it, once installed:

- the toolbar button
- right-click a page or a link, then "Add to Perspectize"
- the keyboard shortcut (default Alt+Shift+P; change it at `chrome://extensions/shortcuts`)

Pages that cannot be added (`chrome://`, `file://`, the Chrome Web Store) show a brief `!` on the toolbar button instead of opening a form.

## Permissions

| Permission | Why |
|---|---|
| `activeTab` | read the current tab's address and title when you click the button |
| `contextMenus` | the right-click entry |
| `storage` | remember which Perspectize address to open (entered on the options page; kept on this browser only, never synced). Not an auth token |

There are no host permissions, so Chrome shows no "read and change all your data" warning. The extension sends nothing anywhere except by opening the Perspectize page you can see.

## Build and load

```
pnpm --dir extension install
pnpm --dir extension build
```

Then open `chrome://extensions`, turn on Developer mode, choose "Load unpacked" and pick this `extension/` folder. Reload the extension after each build.

## Which Perspectize it opens

There is no built-in address, so no deployment's URL is committed. The first click opens the options page; enter your Perspectize address there (or use the `localhost:5173` button). It is saved in `chrome.storage.local`, so it stays on this browser and is not synced to your Google account. Only the origin is kept.

## Tests

`pnpm --dir extension test` covers the URL builder, the unsupported-page check and the base-URL choice. The service worker and options page are thin glue over those and are checked by loading the extension unpacked.

## Publishing

See `STORE_LISTING.md`.
