# Getting Started

**Route:** /
**Summary:** What a signed-out visitor sees (a guest landing page on every route), how to sign in, the two-step "Getting started" coach that walks a new signed-in user through adding a first video and leaving a first perspective, and the header's top-level navigation links. A signed-in visitor who opens `/` is forwarded to the Library at `/content-library`.

## getting-started.guest-landing
**Task:** See what Perspectize offers before signing in
**Where:** Any page, while signed out
**Steps:**
1. Visit the site without signing in.
2. Read the **When 👍 is not enough** heading and the description that follows it.
3. If a product video is shown, select its **Watch how it works** play button to watch it.
**Not supported:** Browsing the Library, Discover, Compare, Plan, or Import pages before signing in. Every route shows this same landing screen until you sign in.
**Notes:** The header's page links (Library, Discover, Compare, Plan, Import) are visible while signed out, but selecting one still shows this landing screen. Before the sign-in service finishes loading, the page shows only "Loading...".
**Sign-in required:** no
**Source:** `frontend/src/routes/+layout.svelte`, `frontend/src/lib/components/onboarding/GuestLanding.svelte`, `frontend/src/lib/components/onboarding/OnboardingVideo.svelte`, `frontend/src/lib/components/Header.svelte`

## getting-started.sign-in
**Task:** Sign in or create an account
**Where:** Guest landing screen → **Sign in** button, or header → **Sign In** button
**Steps:**
1. Select **Sign in** on the landing screen, or **Sign In** in the header (only shown while signed out).
2. Complete the sign-in form that opens in a dialog.
**Notes:** Perspectize has no separate sign-up button. The sign-in dialog is Clerk's own widget, so whether it also offers account creation is up to Clerk, not Perspectize.
**Sign-in required:** no
**Source:** `frontend/src/lib/components/onboarding/GuestLanding.svelte`, `frontend/src/lib/components/Header.svelte`, `frontend/src/lib/components/auth/SignInTrigger.svelte`

## getting-started.onboarding-coach
**Task:** Get walked through adding a first video and leaving a first perspective
**Where:** Floating panel in the bottom-right corner (desktop) or bottom drawer (mobile), over the app after signing in
**Steps:**
1. Sign in as a new user, or as a user who hasn't dismissed the coach and hasn't yet added a video and left a perspective. The coach opens by itself, showing "Getting started · Step 1 of 2".
2. On step 1 (**Add a video**), select **Add video** to open the add-video dialog, or **Skip step** to move on.
3. On step 2 (**Leave a perspective**), select **Leave a perspective** to write one on the video shown after "On:" (the coach prefers a video you added that has no perspective from you yet), or select **Skip step**.
4. If you've dismissed the coach and want it back, select the gear icon (**Settings**) in the header, open **General**, and select **Restart onboarding** in the "Getting started" row. Settings closes and the coach opens right away at step 1.
**Not supported:** Bringing the coach back from a Help menu, or with a setting that takes effect at your next sign-in. **Restart onboarding** is the only way, and it acts immediately.
**Notes:** Finishing both steps, skipping step 2, the X button, **Skip all**, **Don't show again**, pressing Escape (while no dialog from the coach is open), and closing the mobile drawer all dismiss the coach, and it then doesn't open again by itself. If the coach finds no video you added, step 2 says "Your library is empty." and offers **Back to add video** or **Skip step**. An account that already has both a video it added and a perspective is marked as done without ever seeing the coach (the video check looks only at the 20 most recently updated Library items). **Restart onboarding** stays greyed out until your account has loaded.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/onboarding/OnboardingShell.svelte`, `frontend/src/lib/components/onboarding/OnboardingCoach.svelte`, `frontend/src/lib/onboarding/eligibility.ts`, `frontend/src/lib/onboarding/coachGate.svelte.ts`, `frontend/src/lib/onboarding/steps.ts`, `frontend/src/lib/components/SettingsDialog.svelte`, `frontend/src/lib/components/Header.svelte`

## getting-started.top-nav
**Task:** Navigate to a top-level area of the app
**Where:** Header
**Steps:**
1. Select **Library** to go to the Library page (`/content-library`), where everything members have added is listed.
2. Select **Discover** to go to the Discover page.
3. Select **Compare** to go to the Compare page.
4. Select **Plan** to go to the Plan page, a list of your Todos (which can be linked to content), with an **Add Todo** button.
5. Select **Import** to go to the Import page, marked Preliminary, which lists whole channels and filmographies you can pick items from. Its **Request an import** tab starts a new request.
6. Select the **Perspectize** name in the header to go to the home page, which forwards you to the Library.
**Notes:** The Library is the page that used to be called Activity. The link for the page you're currently on is visually highlighted. Discover and Compare are covered in their own guide areas.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/Header.svelte`, `frontend/src/routes/+page.svelte`, `frontend/src/lib/utils/contentLinks.ts`, `frontend/src/routes/plan/+page.svelte`, `frontend/src/lib/components/plan/PlanBoard.svelte`, `frontend/src/routes/import/+page.svelte`
