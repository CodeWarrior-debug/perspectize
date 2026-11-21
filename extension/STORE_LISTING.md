# Chrome Web Store listing checklist

Publishing is a later, owner-run step. Before submitting:

- [ ] A Chrome Web Store developer account in the owner's name (one-time registration fee).
- [ ] Decide how a store user learns the app's address: the extension has no built-in one and asks for it on first click. Once a public production domain exists, add it as the default in `src/baseUrl.ts` and rebuild.
- [ ] A privacy policy page in the app, and its URL in the listing (none exists today). Content: the extension collects nothing; it opens the Perspectize page for the tab you chose.
- [ ] Permission justifications for the review form:
  - `activeTab`: read the current tab's address and title when the user clicks the button.
  - `contextMenus`: the "Add to Perspectize" right-click entry.
  - `storage`: remember the chosen Perspectize address (entered on the options page; kept on this browser only).
- [ ] "Single purpose" statement: add the page the user is viewing to their Perspectize library.
- [ ] Screenshots (1280x800) of the toolbar button, the popup window and the right-click menu.
- [ ] Store icon 128x128 (the manifest ships 192 and 512).
- [ ] Zip `manifest.json`, `options.html`, `icons/` and `dist/` only.
- [ ] Bump `version` in `manifest.json` for each upload.
