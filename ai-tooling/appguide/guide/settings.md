# Settings & Theme

**Route:** Settings dialog (opened from the header)
**Summary:** Settings is a dialog you open from the header's gear icon. It has four sections: General (restart the onboarding walkthrough), Customize Theme (colors), Fonts (pick Google Fonts for headings, table cells and long-form reading) and Send Feedback (report a bug or request a feature on GitHub). Account management and sign-out live in the header's user avatar menu, next to the Settings icon.

## settings.open
**Task:** Open the Settings dialog
**Where:** Header → gear icon (labeled "Settings")
**Steps:**
1. While signed in, select the **Settings** icon in the header (next to your avatar).
2. Select **General**, **Customize Theme**, **Fonts** or **Send Feedback** in the section list to switch between sections.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/Header.svelte`, `frontend/src/lib/components/SettingsDialog.svelte`

## settings.onboarding-toggle
**Task:** Bring back the intro walkthrough (onboarding coach)
**Where:** Settings → General → "Getting started" row
**Steps:**
1. Open **Settings** and select **General**.
2. In the **Getting started** row, select **Restart onboarding**.
**Not supported:** A toggle that brings the coach back at your next sign-in. **Restart onboarding** acts immediately.
**Notes:** Settings closes and the onboarding coach opens right away at step 1. The button stays greyed out until your account has loaded. The coach's own steps are in `getting-started.onboarding-coach`.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/SettingsDialog.svelte`, `frontend/src/lib/onboarding/coachGate.svelte.ts`

## settings.change-fonts
**Task:** Change the font used for headings, table cells or long-form reading
**Where:** Settings → Fonts
**Steps:**
1. Open **Settings** and select **Fonts**. The font list loads when the section opens ("Loading fonts…" shows until it is ready).
2. Under the slot you want (**Headings**, **Table cells** or **Long-form reading**), select the font box. It shows the current font, for example "Geist (default)".
3. Type part of a font name to search, or narrow the list with the **All**, **Serif**, **Sans-serif**, **Monospace**, **Display** and **Handwriting** buttons and the **Variable only** checkbox.
4. Select a font, or highlight it with the arrow keys and press Enter, to keep it. The change applies across the app right away.
**Not supported:** Uploading your own font file or using a font that isn't on Google Fonts.
**Notes:** Hovering over a font, or moving through the list with the arrow keys, previews it on the page. Pressing Esc or Tab, or leaving the list, restores your saved font. The info icon beside each slot name explains what the slot covers: Headings is page and dialog titles and table column headers; Table cells is table cells, item titles, stats and tags; Long-form reading is descriptions, synopses, Bible passages, comments and perspective text. Fonts load from Google Fonts, and your picks are saved in this browser only, so they don't follow you to another device.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/SettingsDialog.svelte`, `frontend/src/lib/components/fonts/FontSettingsPanel.svelte`, `frontend/src/lib/components/fonts/FontPicker.svelte`, `frontend/src/lib/fonts/slots.ts`, `frontend/src/lib/fonts/store.svelte.ts`

## settings.font-pairing
**Task:** Apply a ready-made combination of fonts
**Where:** Settings → Fonts → Pairings
**Steps:**
1. Open **Settings** and select **Fonts**.
2. In the **Pairings** row, select **Editorial**, **Modern**, **Technical**, **Bookish** or **Accessible**.
**Notes:** A pairing sets all three slots (Headings, Table cells, Long-form reading) at once, and the pairing that matches your current fonts is highlighted. Hovering over a pairing shows the three fonts it uses. The Pairings row appears once the font list has loaded.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/fonts/FontSettingsPanel.svelte`, `frontend/src/lib/fonts/slots.ts`

## settings.reset-fonts
**Task:** Go back to the app's default fonts
**Where:** Settings → Fonts
**Steps:**
1. Open **Settings** and select **Fonts**.
2. Select the **Default** pairing in the **Pairings** row to reset all three slots, or select a slot's **Use default** button to reset only that slot.
**Notes:** **Use default** appears only for a slot where you have picked a font. The app's own fonts are Geist for Headings, Charter for Table cells and Charter + Georgia for Long-form reading.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/fonts/FontSettingsPanel.svelte`, `frontend/src/lib/fonts/slots.ts`

## settings.font-peek
**Task:** See the whole page while choosing fonts
**Where:** Settings → Fonts → Peek button
**Steps:**
1. Open **Settings** and select **Fonts**.
2. Select **Peek**. Settings hides so you can see your fonts on the full page.
3. Select the floating **Back to Settings** button to return to the Fonts section.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/SettingsDialog.svelte`, `frontend/src/lib/components/fonts/FontSettingsPanel.svelte`

## settings.send-feedback
**Task:** Report a bug or request a feature
**Where:** Settings → Send Feedback
**Steps:**
1. Open **Settings** and select **Send Feedback**.
2. Select **Report a bug** (something isn't working as expected) or **Request a feature** (an idea for improvement).
3. Add your details on the GitHub new-issue page that opens in a new browser tab, then submit it there.
**Not supported:** Sending feedback from inside Perspectize without going to GitHub.
**Notes:** Settings closes when you choose either button. Each button opens GitHub's new-issue form with the matching template (bug report or feature request).
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/SettingsDialog.svelte`, `frontend/src/lib/components/FeedbackDialog.svelte`

## settings.manage-account
**Task:** View or edit your account details
**Where:** Header → avatar
**Steps:**
1. Select your avatar in the header (next to the Settings icon) to open the account menu.
2. Choose the option to manage your account.
**Notes:** This opens Clerk's account management UI, not the Perspectize Settings dialog.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/Header.svelte`, `frontend/src/lib/components/auth/UserMenu.svelte`

## settings.sign-out
**Task:** Sign out of Perspectize
**Where:** Header → avatar
**Steps:**
1. Select your avatar in the header (next to the Settings icon) to open the account menu.
2. Choose the option to sign out.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/Header.svelte`, `frontend/src/lib/components/auth/UserMenu.svelte`
