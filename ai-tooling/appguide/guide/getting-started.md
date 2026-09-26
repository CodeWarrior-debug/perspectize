# Getting Started

**Route:** /
**Summary:** What a new, signed-out visitor sees before they sign in, how to sign in or create an account, and the checklist coach that walks a new signed-in user through adding their first video and perspective. Also covers the header's top-level navigation links, which are visible on every page.

## getting-started.guest-landing
**Task:** See what Perspectize offers before signing in
**Where:** Any page, while signed out
**Steps:**
1. Visit the site without signing in.
2. Read the "Perspectize" heading and the description below it.
3. If a product video is configured, select its play button to watch it.
**Not supported:** Browsing the Activity, Discover, or Compare pages before signing in — every route shows this same landing screen until you sign in.
**Sign-in required:** no
**Source:** `frontend/src/routes/+layout.svelte`, `frontend/src/lib/components/onboarding/GuestLanding.svelte`, `frontend/src/lib/components/onboarding/OnboardingVideo.svelte`

## getting-started.sign-in
**Task:** Sign in or create an account
**Where:** Guest landing screen → **Sign in** button, or header → **Sign In** button
**Steps:**
1. Select **Sign in** on the landing screen, or **Sign In** in the header (only shown while signed out).
2. Complete the sign-in form that opens in a dialog.
**Notes:** The sign-in dialog is Clerk's own widget; Perspectize doesn't control its exact contents (e.g. whether it also offers account creation).
**Sign-in required:** no
**Source:** `frontend/src/lib/components/onboarding/GuestLanding.svelte`, `frontend/src/lib/components/Header.svelte`

## getting-started.onboarding-coach
**Task:** Get walked through adding a first video and leaving a first perspective
**Where:** Floating panel (desktop) or bottom drawer (mobile), over the app after signing in
**Steps:**
1. Sign in as a new user, or as a user who hasn't yet added a video and left a perspective — the checklist coach opens automatically, showing "Getting started · Step 1 of 2".
2. On step 1, select **Add video** to add one, or **Skip step** to move on.
3. On step 2, select **Leave a perspective** on the suggested video, or **Skip step**.
4. If you've dismissed the coach and want it back, open Settings and turn on **Show onboarding next session**.
**Notes:** The X button, **Skip all**, and **Don't show again** all dismiss the coach for good, the same as finishing both steps. The **Show onboarding next session** toggle takes effect starting your next sign-in, not immediately.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/onboarding/OnboardingShell.svelte`, `frontend/src/lib/components/onboarding/OnboardingCoach.svelte`, `frontend/src/lib/onboarding/eligibility.ts`, `frontend/src/lib/onboarding/coachGate.svelte.ts`, `frontend/src/lib/onboarding/steps.ts`, `frontend/src/lib/components/SettingsDialog.svelte`

## getting-started.top-nav
**Task:** Navigate to a top-level area of the app
**Where:** Header
**Steps:**
1. Select **Activity** to go to the home/library page.
2. Select **Discover** to go to the Discover page.
3. Select **Compare** to go to the Compare page.
**Notes:** The link for the page you're currently on is visually highlighted. What each destination does is covered in its own guide area.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/Header.svelte`
