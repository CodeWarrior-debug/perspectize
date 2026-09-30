# Settings & Theme

**Route:** Settings dialog (opened from the header)
**Summary:** Settings is a dialog you open from the header's gear icon, with two sections: General (account-wide preferences like the onboarding toggle) and Customize Theme (colors). Account management and sign-out live in the header's user avatar menu, next to the Settings icon.

## settings.open
**Task:** Open the Settings dialog
**Where:** Header → gear icon (labeled "Settings")
**Steps:**
1. While signed in, select the **Settings** icon in the header (next to your avatar).
2. Use the **General** and **Customize Theme** links to switch sections.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/Header.svelte`, `frontend/src/lib/components/SettingsDialog.svelte`

## settings.onboarding-toggle
**Task:** Turn the intro walkthrough back on for your next sign-in
**Where:** Settings → General
**Steps:**
1. Open **Settings** and select **General**.
2. Switch on **Show onboarding next session**.
**Notes:** Turning this on brings the onboarding coach back.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/SettingsDialog.svelte`, `frontend/src/lib/queries/users/useSetOnboardingDisplayNextSession.ts`

## settings.manage-account
**Task:** View or edit your account details
**Where:** Header → avatar
**Steps:**
1. Select your avatar in the header (next to the Settings icon) to open the account menu.
2. Choose the option to manage your account.
**Notes:** This opens Clerk's account management UI, not the Perspectize Settings dialog.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/Header.svelte`

## settings.sign-out
**Task:** Sign out of Perspectize
**Where:** Header → avatar
**Steps:**
1. Select your avatar in the header (next to the Settings icon) to open the account menu.
2. Choose the option to sign out.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/Header.svelte`
