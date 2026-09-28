# Phase 16: Mobile App Strategy - Research

**Researched:** 2026-02-16
**Domain:** Mobile app distribution — Capacitor, Tauri Mobile, PWA with SvelteKit adapter-static
**Confidence:** HIGH (Capacitor), LOW (Tauri Mobile), HIGH (PWA)

---

## Summary

Phase 16 evaluates three approaches for shipping the existing SvelteKit SPA as a mobile app. The app already uses `adapter-static` with `prerender = true`, which means it produces a static HTML/JS/CSS bundle — the exact output format all three approaches consume.

**Capacitor** is the clear front-runner for App Store / Play Store distribution. It has a mature plugin ecosystem, documented SvelteKit integration, and real apps have shipped using this exact stack (SvelteKit + adapter-static + Capacitor). The integration involves minimal code changes: add `@capacitor/core`, point `webDir` to `build/`, run `npx cap sync`. One real-world developer published a SvelteKit app to both stores with this setup.

**PWA** is the right choice if app store distribution is not required. The `@vite-pwa/sveltekit` plugin provides zero-config offline support. Push notifications work on iOS 16.4+ (home screen install required) and Android Chrome. Biometrics work via WebAuthn. No Apple developer account or review process needed. Instant updates by deploying new static files.

**Tauri Mobile** is not production-ready for this project. The Tauri 2.0 team itself acknowledges "we are not completely happy about the developer experience at the moment." Community feedback describes iOS support as "closer to alpha than beta" with build pipeline issues, missing plugin documentation, and simulator deployment failures. Tauri adds Rust complexity with no concrete benefit over Capacitor for a web-first app.

**Primary recommendation:** Use Capacitor for native App Store / Play Store distribution. Use `@vite-pwa/sveltekit` as a complementary PWA layer (or standalone if store distribution is not needed).

---

## Standard Stack

### Core (Capacitor path)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@capacitor/core` | 8.x (latest) | WebView bridge runtime | Ionic-backed, mature, framework-agnostic |
| `@capacitor/cli` | 8.x (latest) | Build tooling and platform sync | Required companion to core |
| `@capacitor/ios` | 8.x | iOS native project scaffold | Official iOS support |
| `@capacitor/android` | 8.x | Android native project scaffold | Official Android support |
| `@capacitor/push-notifications` | 7.x/8.x | FCM-based push for iOS + Android | Official plugin, FCM-backed |
| `@capacitor/preferences` | latest | Secure key-value storage (replaces localStorage) | OS-level storage, not evicted |

### Core (PWA path)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@vite-pwa/sveltekit` | 0.10+ | Zero-config PWA plugin for SvelteKit | Official Vite PWA integration for SvelteKit |
| Workbox (included) | bundled | Service worker caching strategy | Industry standard, included in vite-pwa |

### Supporting (Capacitor)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@capgo/capacitor-updater` | latest | OTA live updates without store review | When you want to ship JS-only updates instantly |
| `@capacitor/biometric-auth` (capawesome) | latest | Fingerprint/Face ID native auth | When Phase 12 auth is complete and biometrics needed |
| `@capawesome/capacitor-live-update` | latest | Alternative OTA update mechanism | Alternative to Capgo for self-hosted OTA |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Capacitor | Tauri Mobile | Tauri has smaller binaries but iOS DX is pre-production quality; plugin ecosystem is immature for mobile |
| Capacitor | React Native | React Native requires full rewrite from SvelteKit; no benefit for existing web app |
| @vite-pwa/sveltekit | SvelteKit built-in service worker | vite-pwa handles precache manifest complexity that the built-in approach requires you to manage manually |

**Installation (Capacitor):**
```bash
npm install @capacitor/core @capacitor/cli
npm install @capacitor/ios @capacitor/android
npx cap init [AppName] [com.yourapp.id]
npx cap add ios
npx cap add android
```

**Installation (PWA):**
```bash
pnpm add -D @vite-pwa/sveltekit
```

---

## Architecture Patterns

### Recommended Project Structure (Capacitor)

```
perspectize/
├── frontend/                # SvelteKit source (unchanged)
│   ├── src/
│   ├── svelte.config.js     # adapter-static (already configured)
│   └── build/               # Output — this becomes webDir
├── ios/                     # Generated Xcode project (check into git)
│   └── App/
├── android/                 # Generated Android Studio project (check into git)
│   └── app/
└── capacitor.config.ts      # Root config — points to frontend/build
```

### Pattern 1: Capacitor Config Pointing to Frontend Build

**What:** The `capacitor.config.ts` at the monorepo root (or frontend root) must point `webDir` to the SvelteKit build output.

**When to use:** Always for Capacitor in this monorepo.

**Example:**
```typescript
// capacitor.config.ts (in frontend/ or repo root)
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.perspectize.app',
  appName: 'Perspectize',
  webDir: 'build',  // SvelteKit adapter-static output directory
  server: {
    androidScheme: 'https'  // Required for secure storage and cookies on Android
  }
};

export default config;
```

### Pattern 2: SPA Mode for Capacitor (Replace prerender = true)

**What:** SvelteKit's `prerender = true` in `+layout.ts` produces static HTML for each route. For Capacitor, `prerender = false` + `ssr = false` + a fallback index is simpler and avoids build-time Tauri/Capacitor API access issues.

**When to use:** Only change if prerendering causes issues. Current `prerender = true` with `fallback: '404.html'` in `svelte.config.js` may work fine — test first.

**Current state:** The project already uses `adapter-static` with `prerender = true` and `fallback: '404.html'`. This is compatible with Capacitor. The `webDir: 'build'` config is all that's needed.

**SPA fallback config (only if prerender causes issues):**
```typescript
// src/routes/+layout.ts
export const prerender = false;
export const ssr = false;
```

```javascript
// svelte.config.js adapter config
adapter({
  fallback: 'index.html',  // Change from '404.html' for cleaner SPA routing
})
```

### Pattern 3: bundleStrategy: 'single' for HTTP/1 WebView

**What:** Capacitor's local server uses HTTP/1, which limits concurrent connections. SvelteKit's default `split` bundle strategy produces many small chunks that load slowly over HTTP/1. The `single` strategy bundles everything into one file.

**When to use:** If load performance is slow in the WebView after initial integration.

**Example:**
```javascript
// svelte.config.js
const config = {
  kit: {
    adapter: adapter({...}),
    output: {
      bundleStrategy: 'single'  // One JS bundle + one CSS file
    }
  }
};
```

**Tradeoff:** All users download the entire app upfront. Acceptable for a focused productivity app like Perspectize. The current uncompressed build is 1.5MB total — very manageable.

### Pattern 4: Platform Detection for Native APIs

**What:** Some features behave differently in WebView vs browser (storage, auth, notifications). Use `Capacitor.isNativePlatform()` to branch.

**When to use:** Whenever using `@capacitor/preferences` vs `localStorage`, or native push vs web push.

```typescript
// Source: Capacitor official docs
import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

// Storage example: use Preferences on native, localStorage on web
if (isNative) {
  await Preferences.set({ key: 'auth_token', value: token });
} else {
  localStorage.setItem('auth_token', token);
}
```

### Pattern 5: PWA Registration with vite-pwa/sveltekit

**What:** Add the plugin, disable SvelteKit's built-in service worker (conflict), inject the manifest link in layout.

**When to use:** PWA-only path, or as complement to Capacitor for the web version.

**Example:**
```javascript
// vite.config.js
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default {
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Perspectize',
        short_name: 'Perspectize',
        theme_color: '#1a365d',
        background_color: '#1a365d',
        icons: [/* ... */]
      }
    })
  ]
};
```

```javascript
// svelte.config.js — disable built-in SW (required)
kit: {
  serviceWorker: {
    register: false
  }
}
```

```svelte
<!-- src/routes/+layout.svelte — inject manifest link -->
<script>
  import { pwaInfo } from 'virtual:pwa-info';
  $: webManifestLink = pwaInfo ? pwaInfo.webManifest.linkTag : '';
</script>
<svelte:head>
  {@html webManifestLink}
</svelte:head>
```

### Anti-Patterns to Avoid

- **Using localStorage for auth tokens in Capacitor:** iOS can evict web storage under memory pressure. Use `@capacitor/preferences` on native platform.
- **Forgetting `npx cap sync` after adding plugins:** Native files change when plugins are added; sync is required before build.
- **Keeping live reload config in production builds:** `livereload` settings in `capacitor.config.ts` must be removed before production builds.
- **Pure PWA for App Store distribution:** Apple Guideline 4.2 rejects web-only wrappers. Capacitor's native bridge (even minimal haptics) provides the "native value" reviewers need.
- **Using Tauri Mobile for production now:** DX is pre-production quality — build pipeline complexity, incomplete iOS plugin coverage, simulator deployment failures.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OTA updates | Custom update checker + download logic | `@capgo/capacitor-updater` | Handles staged rollouts, encryption, rollback, Apple compliance |
| Push notification handling | Custom FCM integration | `@capacitor/push-notifications` | Handles APNS + FCM, permission flows, foreground/background state |
| Secure storage | Encrypted localStorage wrapper | `@capacitor/preferences` | Uses iOS Keychain / Android Keystore natively; localStorage is evictable |
| Biometric auth | Custom WebAuthn flow for native | `@capawesome/capacitor-biometrics` | Handles Face ID / Touch ID / Fingerprint with proper native UX |
| Service worker caching | Hand-written service worker | `@vite-pwa/sveltekit` (Workbox) | Precache manifest generation is build-tool-integrated; hand-rolling gets stale URLs |
| App Store build pipeline | Custom Fastlane scripts | Capacitor's `npx cap build` + standard Xcode/Gradle | Capacitor handles signing configuration plumbing |

**Key insight:** Capacitor's plugin ecosystem exists precisely because native mobile APIs (push, storage, biometrics) have platform-specific edge cases that are expensive to get right. The plugin authors have already absorbed that complexity.

---

## Common Pitfalls

### Pitfall 1: webDir Mismatch

**What goes wrong:** Build works but the native app shows a blank screen or loads old content.

**Why it happens:** `capacitor.config.ts` `webDir` doesn't match the SvelteKit adapter-static output directory. The default is `dist` but SvelteKit adapter-static outputs to `build`.

**How to avoid:** Set `webDir: 'build'` in `capacitor.config.ts`. Run `npx cap sync` after every `npm run build`.

**Warning signs:** Blank white screen in Simulator/Emulator after sync.

### Pitfall 2: Missing `npx cap sync` After Plugin Install

**What goes wrong:** JavaScript calls to Capacitor plugin APIs fail silently or throw "Plugin not implemented" errors.

**Why it happens:** Installing a Capacitor plugin via npm only installs the JavaScript bridge. The native Swift/Kotlin code is installed separately via `cap sync`.

**How to avoid:** `npm install @capacitor/plugin-name && npx cap sync` — always run both commands together.

**Warning signs:** `Capacitor plugin X not implemented for native platform` in console logs.

### Pitfall 3: iOS App Store Rejection for Web-Only Wrapper

**What goes wrong:** Apple rejects the app under Guideline 4.2 ("Minimum Functionality").

**Why it happens:** A pure WebView wrapper with no native interaction looks like a "web clipping" to reviewers.

**How to avoid:** Add at least one native interaction — haptic feedback (`@capacitor/haptics`) on button press is sufficient. One developer shipped by adding just haptics vibration on key interactions. The app must "justify its place in the App Store."

**Warning signs:** Rejection message referencing "Guideline 4.2 - Minimum Functionality."

### Pitfall 4: localStorage Eviction on iOS

**What goes wrong:** Authenticated users are randomly logged out on iOS.

**Why it happens:** iOS evicts WebView localStorage under memory pressure. This is documented Capacitor behavior.

**How to avoid:** Use `@capacitor/preferences` for any persistent auth state (JWT tokens, user session data) when running natively. Branch on `Capacitor.isNativePlatform()`.

**Warning signs:** Random logout reports from iOS users only.

### Pitfall 5: HTTP/1 WebView Causes Slow Load

**What goes wrong:** App takes 3-5s to load in the WebView on first launch.

**Why it happens:** Capacitor's local server is HTTP/1. SvelteKit's default `split` bundle strategy creates many small JS chunks. HTTP/1 serializes requests, causing waterfall loading.

**How to avoid:** Use `output.bundleStrategy: 'single'` in svelte.config.js. This trades code splitting for a single faster-loading bundle.

**Warning signs:** Long initial load time in Simulator despite fast on-device network.

### Pitfall 6: vite-pwa Conflict with SvelteKit Built-In Service Worker

**What goes wrong:** Service worker registration fails or double-registers.

**Why it happens:** SvelteKit has its own service worker support (`src/service-worker.js`). `@vite-pwa/sveltekit` conflicts with it if both are active.

**How to avoid:** Set `kit.serviceWorker.register: false` in `svelte.config.js` when using vite-pwa.

**Warning signs:** Double service worker registration in DevTools, caching behaves unexpectedly.

### Pitfall 7: PWA Push Notifications Only Work for Home-Screen Installs on iOS

**What goes wrong:** Push notifications don't arrive for iOS Safari users who haven't added to home screen.

**Why it happens:** Apple restricts PWA push to home-screen installed web apps only (requires iOS 16.4+). In-browser PWA on iOS cannot receive push.

**How to avoid:** Clearly communicate home-screen install requirement to iOS users. For reliable push across all iOS users, Capacitor native app is required.

**Warning signs:** Push works on Android but not iOS.

### Pitfall 8: Tauri iOS Build Complexity

**What goes wrong:** iOS simulator deployment fails when using Tauri with app extensions; build pipeline creates circular Xcode dependencies.

**Why it happens:** Tauri's iOS build system is immature — the team acknowledges it openly in their 2.0 release notes. Plugin ecosystem is incomplete, documentation is outdated, developer experience does not match desktop.

**How to avoid:** Do not use Tauri Mobile for this project. Use Capacitor.

---

## Code Examples

Verified patterns from official sources and real-world SvelteKit + Capacitor apps:

### Capacitor Initialization (after adapter-static build)

```bash
# In frontend/ directory
npm install @capacitor/core @capacitor/cli
npm install @capacitor/ios @capacitor/android
npx cap init Perspectize com.perspectize.app --web-dir build
npx cap add ios
npx cap add android
```

### Build + Sync Workflow

```bash
# Standard workflow after code changes
npm run build          # SvelteKit outputs to frontend/build/
npx cap sync           # Copies web assets to ios/App + android/app, installs native plugins
npx cap open ios       # Opens Xcode
npx cap open android   # Opens Android Studio
```

### Capacitor Config (capacitor.config.ts)

```typescript
// Source: Capacitor official documentation
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.perspectize.app',
  appName: 'Perspectize',
  webDir: 'build',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};

export default config;
```

### Platform-Aware Storage (auth token pattern)

```typescript
// Source: Capacitor Preferences documentation + real SvelteKit app pattern
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

export async function storeAuthToken(token: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: 'auth_token', value: token });
  } else {
    localStorage.setItem('auth_token', token);
  }
}

export async function getAuthToken(): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    const { value } = await Preferences.get({ key: 'auth_token' });
    return value;
  }
  return localStorage.getItem('auth_token');
}
```

### Minimal Native Touch (haptic feedback for App Store approval)

```typescript
// Source: Capacitor Haptics plugin documentation
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export async function nativeFeedback(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Haptics.impact({ style: ImpactStyle.Light });
  }
}
// Wire to button onPress events for native feel + App Store compliance
```

### PWA Manifest Config (vite-pwa)

```javascript
// Source: @vite-pwa/sveltekit documentation
// vite.config.ts
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig({
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
      },
      manifest: {
        name: 'Perspectize',
        short_name: 'Perspectize',
        description: 'Store, refine, and share perspectives on content',
        theme_color: '#1a365d',
        background_color: '#1a365d',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cordova (Ionic) | Capacitor 8 | Capacitor 7 (Jan 2025), 8 (2026) | Capacitor is the successor; CocoaPods → Swift Package Manager |
| Capacitor CocoaPods | Capacitor Swift Package Manager (SPM) | Cap 7 (Jan 2025), default in Cap 8 | SPM is now default for iOS; CocoaPods deprecated |
| Tauri desktop-only | Tauri 2.0 (mobile beta) | Oct 2024 | Mobile support added but DX is immature |
| PWA no iOS push | PWA push on iOS 16.4+ | Mar 2023 | iOS users can now receive push from home-screen installed PWAs |
| adapter-static split bundles | bundleStrategy: 'single' | Advent of Svelte 2024 | SvelteKit 2.x added single-file bundle option for HTTP/1 WebViews |

**Deprecated/outdated:**
- Cordova: Capacitor is the direct successor; no new projects should use Cordova.
- Capacitor CocoaPods: SPM is now the default in Capacitor 8; Cap 8 requires Xcode 26.0+. Cap 7 requires Xcode 16.0+.
- Tauri v1: Only v2 has mobile support; v1 is desktop-only.

---

## Evaluation Matrix

Scoring per evaluation criterion from the roadmap research scope:

| Criterion | Capacitor | Tauri Mobile | PWA |
|-----------|-----------|--------------|-----|
| Native API access (camera, push, biometrics) | HIGH — extensive plugin ecosystem (100+ plugins) | MEDIUM — plugins exist but mobile coverage incomplete | MEDIUM — WebAuthn biometrics, Web Push, no camera without external lib |
| Offline support | HIGH — WebView caches assets locally; add service worker for network-first | HIGH — same WebView model | HIGH — Workbox precaching |
| App Store distribution | HIGH — same process as native apps | MEDIUM — possible but complex Xcode pipeline | LOW — pure PWA rejected under Guideline 4.2 |
| Development effort | MEDIUM — 1-2 days initial setup, then web-only dev | HIGH — Rust toolchain + mobile-specific pain points | LOW — 2-4 hours to add vite-pwa |
| Bundle size | MEDIUM — ~5-10MB IPA/APK (WebView + bridge) | LOW — smaller binary (~5MB), uses OS WebView | N/A — web assets only |
| Update mechanism | HIGH — OTA via Capgo (JS changes, no store review) + store releases for native changes | MEDIUM — similar pattern in theory, ecosystem less proven | HIGH — instant deploy, no review |
| SvelteKit adapter-static compatibility | HIGH — designed for this; webDir = build | HIGH — same requirement | HIGH — static build is what vite-pwa consumes |
| Ecosystem maturity | HIGH — years of production use, Ionic-backed | LOW — mobile support is new, community feedback negative on iOS DX | HIGH — vite-pwa is stable, Workbox is mature |
| Real-world SvelteKit apps shipped | HIGH — documented apps in stores | LOW — few/none documented | HIGH — trivial for web |

**Recommendation: Capacitor for store distribution, PWA as web complement.**

---

## Proof-of-Concept Plan

The planner should create a POC plan that:

1. Adds Capacitor 8 to the frontend (2-3 hours)
2. Configures `capacitor.config.ts` with correct `webDir: 'build'`
3. Adds `npx cap add ios && npx cap add android`
4. Does a test build: `npm run build && npx cap sync && npx cap open ios`
5. Verifies the app loads in Simulator with all current UI
6. Adds haptic feedback on one button interaction (App Store compliance)
7. Tests AG Grid table scrolling performance in WebView (DOM node count concern)
8. Optional: evaluates `bundleStrategy: 'single'` if load time is poor

**POC success criteria:**
- App loads in iOS Simulator showing the Activity table
- Navigation works (hash-based routing compatible with WebView)
- GraphQL API calls succeed from native WebView context (CORS already configured)
- No white-screen issues

---

## Open Questions

1. **CORS in native WebView**
   - What we know: GraphQL backend uses CORS wildcard (`*`) currently. This should allow native WebView requests.
   - What's unclear: Capacitor sets `Origin: capacitor://localhost` — verify backend accepts this origin.
   - Recommendation: Test during POC. If CORS rejects, add `capacitor://localhost` and `http://localhost` to allowed origins.

2. **Clerk auth (Phase 12) compatibility with Capacitor**
   - What we know: Phase 12 introduces Clerk-based auth. Clerk has a mobile SDK but primarily for React Native.
   - What's unclear: Clerk's web SDK works in WebViews, but OAuth redirect flows may require custom URL scheme handling.
   - Recommendation: Verify Clerk web SDK works in Capacitor WebView before Phase 16 execution. May need `@capacitor/browser` for OAuth redirects.

3. **AG Grid performance in WebView**
   - What we know: AG Grid renders hundreds of DOM nodes for large tables. Capacitor performance guidance says keep DOM under 1,500 nodes.
   - What's unclear: Whether the current AG Grid implementation stays within limits at typical data sizes (50-100 rows).
   - Recommendation: Test in Simulator during POC. If sluggish, consider row virtualization settings (AG Grid has this built in).

4. **Capacitor 7 vs 8**
   - What we know: Cap 7 requires Xcode 16.0+; Cap 8 requires Xcode 26.0+ (very new requirement).
   - What's unclear: Whether the development environment has Xcode 26.
   - Recommendation: Start with Capacitor 7 (stable, widely used, Xcode 16 requirement is achievable). Upgrade to 8 when Xcode 26 is available.

5. **PWA + Capacitor coexistence**
   - What we know: The Khromov SvelteKit journaling app used environment variables to switch between adapter-node (web PWA) and adapter-static (native). Our app is already adapter-static only.
   - What's unclear: Whether `@vite-pwa/sveltekit` can be added alongside Capacitor in the same build.
   - Recommendation: They should coexist since vite-pwa operates at build time. The static output serves both Capacitor and web with PWA manifest.

---

## Sources

### Primary (HIGH confidence)

- Official Capacitor documentation (capacitorjs.com) — Svelte integration, Preferences API, Push Notifications API, App Store deployment guide
- Official SvelteKit documentation (svelte.dev) — adapter-static, SPA mode, bundleStrategy, single-page apps
- Official vite-pwa/sveltekit documentation (vite-pwa-org.netlify.app) — SvelteKit configuration, adapter-static integration
- Tauri 2.0 official release blog (v2.tauri.app/blog/tauri-20/) — mobile support status, known limitations

### Secondary (MEDIUM confidence)

- Capacitor 7 GA announcement: https://ionic.io/blog/capacitor-7-has-hit-ga — version requirements verified
- Capgo blog on SvelteKit + Capacitor: https://capgo.app/blog/creating-mobile-apps-with-sveltekit-and-capacitor/ — integration steps verified against official docs
- vite-pwa SvelteKit framework docs: https://vite-pwa-org.netlify.app/frameworks/sveltekit — configuration examples verified
- Apple 2025 policy updates for Capacitor (capgo.app) — OTA encryption requirement confirmed

### Tertiary (LOW confidence — review during execution)

- Tauri iOS community feedback discussion (github.com/tauri-apps/tauri/discussions/10197) — developer experience reports; subjective but consistent
- Bryan Hogan SvelteKit + Capacitor blog — iOS development barrier assessment
- Nextnative blog on Capacitor performance — DOM node limit (1,500) is approximation, not official spec

### Real-World Validation

- **Stanislav Khromov** (khromov.se) — published a SvelteKit + adapter-static + Capacitor app to both App Store and Google Play. Confirmed: works, haptics added for App Store compliance, `@capacitor/preferences` for auth storage. This is the closest analog to Perspectize.

---

## Metadata

**Confidence breakdown:**
- Standard stack (Capacitor): HIGH — official docs, real shipped apps, mature ecosystem
- Standard stack (PWA): HIGH — official vite-pwa docs, established pattern
- Standard stack (Tauri): LOW — official docs exist but mobile DX is immature; community reports negative
- Architecture patterns: HIGH — verified against official Capacitor and SvelteKit documentation
- Pitfalls: MEDIUM — mix of official documentation warnings and community experience reports
- Evaluation matrix: MEDIUM — qualitative assessment based on documentation and community evidence

**Research date:** 2026-02-16
**Valid until:** 2026-08-16 (stable ecosystem; 6 months before re-checking Tauri mobile maturity)

**Key versions as of research date:**
- Capacitor: 8.x (current, requires Xcode 26+); 7.x (stable, requires Xcode 16+)
- @vite-pwa/sveltekit: 0.10+ (supports SvelteKit 2)
- Tauri: 2.0 stable (desktop), mobile in active development post-stable
- SvelteKit: 2.52+ (confirmed in package.json)
