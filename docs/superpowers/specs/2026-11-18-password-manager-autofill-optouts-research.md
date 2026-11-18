# Password-manager opt-outs and fill triggers — research

**Status:** research spike, not a superpowers plan
**Date:** 2026-11-18 (all sources accessed 2026-11-18)
**Issue:** #582 "Research: which password-manager opt-outs actually work, and which labels trigger them"
**Feeds:** #581 (opt non-identity inputs out of password-manager fill)

## Method and limits

- Sources were searched with generic queries (no project details sent). Primary pages were fetched and summarised by a fetch tool, so every quotation below was **extracted by that tool, not copied from a raw browser view**. Re-check wording against the live page before quoting it in external text.
- Where a primary source could not be fetched (HTTP 403/404 or no official page found), the claim is marked **unverified** and the secondary source is named.
- This doc answers the documentation half of #582. The browser half (attributes on vs stripped, per field type, per manager, with each manager's icon observed) needs a real browser with the extensions installed and is **not done** here. See "What is still open".

## Summary

- **No manager documents a label or placeholder word that triggers fill.** The "Name" label finding in #582 is an empirical observation for LastPass, not a documented rule. Treat the trigger-word list as unknown until measured.
- **Only 1Password documents a field-level opt-out that it says works today** (`data-1p-ignore` / `data-op-ignore`), with a page-level variant on `<body>`.
- **Bitwarden's own help does not document a field-level attribute.** Its open-source code reads `data-bwignore`, but only when a flag named `honorBitwardenIgnoreAttribute` is true. The default and the user-facing setting for that flag were not verified.
- **LastPass's `data-lpignore="true"` and Dashlane's `data-form-type="other"` could not be confirmed on the vendors' own pages** (LastPass support page not found; Dashlane support pages returned 403). Both appear in secondary sources only.
- **`autocomplete="off"` is not a reliable opt-out for password managers.** MDN states that most modern browsers and password managers do not honour it on login fields. Chromium and Firefox have ignored it for password fields for years, per their own developer discussions and bug tracker. It still governs the browser's own remembered-value history in the spec's sense (see WHATWG below).

## Per-manager findings

### 1Password

| Item | Status | Source |
|---|---|---|
| Field opt-out `data-1p-ignore` | **Documented** (official) | https://www.1password.dev/web/compatible-website-design |
| Alternative `data-op-ignore` for tools that reject digit-leading attributes | **Documented** | same |
| Page opt-out: put `data-1p-ignore` (or `data-op-ignore`) on `<body>` | **Documented** | same |
| Honours `autocomplete="off"` | **Not stated** on the page | same |
| Fill/detection cues | Page says `autocomplete` values "make it easier for 1Password to identify your fields", recommends a `<label>` on every field, unique `id`/`name`, `for` on labels, and that it uses "accessibility cues" to locate fields. It does **not** name label words, placeholders or input types as triggers. | same |
| Community reports that `autocomplete="off"` and `data-1p-ignore` together still failed on a search box | **Community, unverified** | https://www.1password.community/discussions/1password/autocompleteoff-not-respected/161793/replies/161820 (forum thread, not vendor docs) |

Vendor's own guidance for misbehaving pages: report the site and send the page structure (help menu of the extension, "Collect Page Structure"), per the search snippet of the community forum. Not re-verified.

### Bitwarden

| Item | Status | Source |
|---|---|---|
| Domain block (Settings > Autofill > Blocked domains) | **Documented** (official help) | https://bitwarden.com/help/blocking-uris/ |
| Blocking a domain also suppresses passkey prompts and save prompts | **Documented** | same |
| Field-level attribute `data-bwignore` in help docs | **Not documented** in help pages fetched | same, and https://contributing.bitwarden.com/architecture/deep-dives/autofill/ (no mention) |
| `data-bwignore` is read by the extension | **Verified in source** (main branch, accessed 2026-11-18) | https://raw.githubusercontent.com/bitwarden/clients/main/apps/browser/src/autofill/services/collect-autofill-content.service.ts |
| …but only when `honorBitwardenIgnoreAttribute` is true | **Verified in source**: the query filter `:not([data-bwignore])` is added only if `this.honorBitwardenIgnoreAttribute` is set, and the setting is loaded from `settings.honorBitwardenIgnoreAttribute === true`. | same |
| Default value of `honorBitwardenIgnoreAttribute` and where users set it | **Unverified.** The settings-service path I tried returned 404; the search index had no result. | — |
| Other `data-bw*` attribute (`data-bwautofill` on `<span>`) | An **opt-in** for including spans, also gated by a setting | same source |

Consequence (inference, to confirm in a browser): if the default is off, a site that only sets `data-bwignore` gets no Bitwarden opt-out until the user enables the flag. This matches the #582 experiment, where the attributes had no effect in the test dialog (that test used LastPass, so the Bitwarden point is untested).

### LastPass

| Item | Status | Source |
|---|---|---|
| `data-lpignore="true"` on fields | **Unverified.** Official LastPass support page was not found by search. Secondary sources say it is the documented developer attribute. | Secondary: https://www.stefanjudis.com/blog/turn-off-password-managers (cites a LastPass support document it does not link); Stack Overflow answers (not fetched) |
| Reliability | **Disputed in community posts**: one post says LastPass ignores the documented attribute; another says it stopped working after a build; another says it removes the icon but not autofill. Not verified. | https://community.lastpass.com/discussion/1415/lastpass-extension-breaks-webpages-all-over-internet (forum, not vendor docs) |
| "Respect AutoComplete=off" setting | Exists (Extension Preferences > Advanced, per third-party guide). **Off by default** per a third-party help article. A LastPass community moderator said it "may not work on all sites". | https://www.jumpcloud.com/support/disable-lastpass-autofill-in-the-admin-portal (third-party, not LastPass); community moderator quote in https://community.lastpass.com/discussion/887/respect-autocomplete-in-chrome-extension (not fetched) |
| Fill/detection words | **Not documented** | — |

Note: the stefanjudis.com post is a secondary compilation. Its LastPass row is the only place this attribute is tied to a vendor document, and that document was not checked.

### Dashlane

| Item | Status | Source |
|---|---|---|
| `data-form-type="other"` on a field | **Unverified.** Dashlane support articles returned HTTP 403. Secondary sources (a Stack Overflow answer, the stefanjudis.com post) name it. | https://www.stefanjudis.com/blog/turn-off-password-managers (secondary) |
| Dashlane's own docs on developer opt-out | **Not found** in the vendor blog posts fetched. The blog's developer guidance covers form structure, not opt-outs. | https://www.dashlane.com/blog/web-development-compatibility-password-managers (fetched 2026-11-18, publication date Aug 2023 per page) |
| Fields Dashlane deliberately never fills | **Documented**: payment fields, Social Security number inputs, hidden fields, off-screen fields. | https://www.dashlane.com/blog/how-dashlane-protects-you-against-autofill-attacks |
| Detection advice from Dashlane's blog | **Documented as advice**: hidden elements "may confuse password managers"; "Excessive mutations can adversely affect password managers"; avoid rewriting user input in fields. | https://www.dashlane.com/blog/web-development-compatibility-password-managers |

The Dashlane blog's mutation and hidden-element warnings are relevant to the #582 method: the test's `MutationObserver` patching of labels and attributes is itself a page mutation, so a "no effect" result could partly reflect when the patch happened. Not tested.

### Built-in browser managers

| Browser | What is documented / reported | Source and trust |
|---|---|---|
| Chrome | Chromium developers say they ignore `autocomplete='off'` on password fields by default so the password manager works (2014 PSA). Behaviour for address fields is "less consistent" per a bug report. No current Chrome help page found. | Chromium team discussion, https://groups.google.com/a/chromium.org/g/chromium-dev/c/zhhj7hCip5c (old, 2013–2014). **Trust: medium**, not current. |
| Firefox | Firefox's password manager ignores `autocomplete="off"` on login forms (since Firefox 38, per a support thread). Firefox 102 began ignoring it for address autofill too (Bug 1754879). Mozilla treats this as intentional. No Mozilla help page found. | Bugzilla https://bugzilla.mozilla.org/show_bug.cgi?id=1754879 and related bug pages; support thread https://support.mozilla.org/en-US/questions/1064817. **Trust: medium** (bug tracker, not help docs). |
| Safari | **Not researched.** The search returned no Apple source in this session. | — |

## Standards and the spec

- **WHATWG HTML, autofill section (4.10.19.7.1):** "When an element's autofill field name is "off", the user agent should not remember the control's data." This governs what the **browser** stores, not extension behaviour. The spec does not say user agents must ignore `off` for login fields. Source: https://html.spec.whatwg.org/multipage/form-control-infrastructure.html (fetched 2026-11-18, first 100,000 characters only).
- **Tokens with defined meanings** (WHATWG table, consistent with MDN): `one-time-code`, `new-password`, `current-password`. They describe the field's purpose; they do not command any extension to skip it.
- **MDN, `autocomplete` attribute** (https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/autocomplete, fetched 2026-11-18). Verbatim-as-extracted note: "In most modern browsers, setting `autocomplete` to `"off"` will not prevent a password manager from asking the user if they would like to save username and password information, or from automatically filling in those values in a site's login form." Also: "Browsers may also ignore `autocomplete="off"` on login fields to support password managers." And: use `autocomplete="off"` "only where genuinely necessary (such as for CAPTCHA or one-time token fields)".
- **MDN, "Turning off form autocompletion"** (https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Turning_off_form_autocompletion, fetched 2026-11-18): many modern browsers do not support `autocomplete="off"` for login fields, on either the `<form>` or the username/password `<input>`. `autocomplete="new-password"` is suggested for a user-management page where a user sets another person's password, described as "a hint to browsers; some may not comply with it." The page does not mention any vendor `data-*` attribute.

## Trigger words (name / id / label / placeholder)

- **Documented by any manager: none.** Not 1Password (page checked), Bitwarden (help not checked in depth; source not checked for heuristics), Dashlane (blog: no word list), LastPass (no vendor page), browsers (MDN: not listed).
- **Observed in #582 (LastPass, one dialog):** a visible "Name" label on the text field triggered the icon; relabelling to "Title" removed it; renaming the Action label or input ids did not change behaviour. One data point, one manager, one dialog. Not a rule.
- **Not tested:** Email, Address, Phone, Username, Search, and placeholder-only fields. The #582 issue lists them as candidates.

## Verified vs folklore (quick reference for #581)

| Claim | Status |
|---|---|
| `data-1p-ignore` / `data-op-ignore` stop 1Password on a field | Documented by 1Password. Efficacy in practice: community reports mixed. |
| `data-1p-ignore` on `<body>` stops 1Password on the whole page | Documented by 1Password. |
| `data-bwignore` stops Bitwarden on a field | Honoured in source **only when a setting is on**; default unverified; not in Bitwarden help. |
| Bitwarden domain block stops autofill on a site | Documented by Bitwarden (user-side setting). |
| `data-lpignore="true"` stops LastPass | Unverified against LastPass docs; community reports disputed. |
| LastPass "Respect AutoComplete=off" makes `autocomplete="off"` work | Setting exists; off by default per a third-party guide; moderator says it may not work on all sites. |
| `data-form-type="other"` stops Dashlane | Unverified against Dashlane docs (403). Secondary only. |
| `autocomplete="off"` stops password managers | **Not true for login fields** per MDN; Chromium and Firefox ignore it for passwords. |
| `autocomplete="new-password"` stops autofill of a password field | Hint only; browsers may not comply (MDN). |
| Label words "Name", "Email" etc. trigger fill icons | **Not documented.** One LastPass observation only. |
| Dashlane never fills payment, SSN, hidden or off-screen fields | Documented by Dashlane blog. |

## Implications for #581 (recommendation, not a decision)

1. Don't rely on `autocomplete="off"` alone to keep managers off a non-identity input. It is documented as unreliable for login-type fields and the browser's own history use is separate.
2. Where an opt-out is wanted, the only **documented, vendor-owned** attributes are 1Password's (`data-1p-ignore`, `data-op-ignore`). Bitwarden's is in source but gated by a user setting. LastPass and Dashlane attributes are unverified. A defensible fallback is to apply the attributes as a best-effort hint and say so in code comments, rather than treating them as a guarantee.
3. Keep identity-field semantics correct (`autocomplete="username"`, `current-password`, `new-password`, `one-time-code`) for the fields that should be filled. Those are the spec's own purpose tokens and documented by 1Password as helping identification.
4. Avoid label text that looks like identity ("Name", "Email") on non-identity inputs, but only as a precaution: the trigger list is not documented, so this is folklore-level guidance until the browser test runs.
5. A `type="search"` workaround for LastPass search boxes appeared in one forum thread as anecdote only. Not verified.

## What is still open (for the owner or a browser session)

- The on/off comparison per field type, per manager (LastPass, 1Password, Bitwarden, Dashlane) on the Perspectize forms. Needs a real browser with the extensions; not run in this batch.
- Verification of Bitwarden's `honorBitwardenIgnoreAttribute` default and the user setting that controls it.
- LastPass's official developer documentation for `data-lpignore`, and its current "Respect AutoComplete=off" behaviour.
- Dashlane's official `data-form-type` documentation (its support site returned 403 to the fetch tool).
- Safari's built-in manager: not researched.
- Chrome's current official statement on `autocomplete="off"` (only 2013–2014 Chromium discussion found).

## Sources

- 1Password developer docs, compatible website design: https://www.1password.dev/web/compatible-website-design
- Bitwarden help, blocking URIs: https://bitwarden.com/help/blocking-uris/
- Bitwarden clients source, autofill content collector: https://raw.githubusercontent.com/bitwarden/clients/main/apps/browser/src/autofill/services/collect-autofill-content.service.ts
- Bitwarden contributor docs, autofill deep dive: https://contributing.bitwarden.com/architecture/deep-dives/autofill/
- Dashlane blog, web development compatibility: https://www.dashlane.com/blog/web-development-compatibility-password-managers
- Dashlane blog, autofill attacks: https://www.dashlane.com/blog/how-dashlane-protects-you-against-autofill-attacks
- MDN, autocomplete attribute: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/autocomplete
- MDN, turning off form autocompletion: https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Turning_off_form_autocompletion
- WHATWG HTML, form control infrastructure: https://html.spec.whatwg.org/multipage/form-control-infrastructure.html
- Chromium developers, PSA on ignoring `autocomplete='off'` for password fields: https://groups.google.com/a/chromium.org/g/chromium-dev/c/zhhj7hCip5c
- Firefox Bugzilla 1754879 (address autofill): https://bugzilla.mozilla.org/show_bug.cgi?id=1754879
- Secondary compilation (not vendor docs): https://www.stefanjudis.com/blog/turn-off-password-managers
- Third-party LastPass setting guide: https://www.jumpcloud.com/support/disable-lastpass-autofill-in-the-admin-portal
- Community forum threads (not vendor docs): https://www.1password.community/discussions/1password/autocompleteoff-not-respected/161793/replies/161820 and https://community.lastpass.com/discussion/1415/lastpass-extension-breaks-webpages-all-over-internet
