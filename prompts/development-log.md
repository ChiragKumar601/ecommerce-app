# Development Log

A short chronological record of the important steps, decisions and changes on this project. It is a summary, not a transcript. The details live in `intent.md`, `spec.md` and `plan.md`, and their decision IDs are referenced here.

**Working rules (from the owner, 2026-10-06):**
- Update this log after every important step.
- Test each development stage properly before marking it complete.
- Commit each stage to Git once it is completed and verified.

---

## 2026-10-06 — Product intent

1. **Requirements received.** The owner supplied the full product idea, requirements, user flows and V1 scope (saved as `README.md`). Instruction: capture the product intent only — no code, architecture or tech stack — and raise every contradiction or gap as a question instead of assuming.
2. **`intent.md` v1 drafted.** It covered what the product is, the problem, users, journey, features, rules, V1 scope and out-of-scope, and listed 51 open questions (OQ-1 to OQ-51).
3. **Owner decisions, round 1:**
   - **Login:** email or phone, plus a password.
   - **Security question:** used only to reset a password.
   - **Guests:** must log in to use the bag and wishlist.
   - **Orders:** follow a simulated status progression, and reviews are allowed only after Delivered.
   - **Payment:** simulated, with a success or failure result.
   - **Delivery, taxes and serviceability:** predefined values.
   - **Images:** free open-source images.
   - **Coupon tile:** it *is* the HDFC bank offer and leads to a pre-filtered listing.
   - **OQ-49 (order creation):** the owner agreed with "the recommendation", but none had been made. This was pointed out, and the "Awaiting Payment" model was proposed instead.
4. **Owner decisions, round 2:**
   - **Guests:** can add to the bag, but must log in to order.
   - **Phone:** sign-up uses email or phone, but a phone number is mandatory to place an order.
   - **Cash on delivery:** in V1, completed with an OTP at handover.
   - **Payment methods:** card, credits and UPI.
   - **Taxes and delivery:** taxes added at checkout; free delivery above ₹1,999.
   - **Brand names:** left to the team (fictional brands).
   - **Card form:** name, number, expiry and CVV.
5. **Owner decisions, round 3:**
   - **Payment outcomes:** random, including cancelled and timed out.
   - **Combining methods:** credits can be combined with another method; gift cards are a separate method.
   - **Statuses:** advance automatically, and returns and refunds are simulated.
   - **Guests:** can use the wishlist; on a merge, bag quantities are added together.
   - **Phone at checkout:** saved to the account.
   - **Cards:** "which card" means a saved card, with a warning not to enter real card details.
6. **Working preference recorded.** Only ask about decisions that materially affect the product, UX, architecture, security or production. Settle minor details as visible team decisions (T-n). About 45 minor questions were settled that way.
7. **Owner decisions, round 4:**
   - Displayed prices **include tax** (D-36).
   - **No guest checkout** (D-37).
   - A **4-digit delivery OTP for every order**, whatever the payment method (D-38).
   - The Awaiting Payment model confirmed (D-39).
8. **Consistency pass.** Stale lines in the intent were fixed: URL pattern, infinite scroll, logout destination, gift cards as a payment method, and decision-log references.

## 2026-10-06 — Requirements review

9. **Product-requirements review of `intent.md`:** 38 findings (R-01 to R-38). Verdict: NEEDS CLARIFICATION.
10. **Owner approved the recommended option for every finding except R-02.** For R-02, the delivery OTP is shown in the order details and shared with the delivery person (D-41). A labelled "Delivery simulator" plays the delivery person. Key outcomes:
    - V1 is a public showcase, labelled as a demo (R-01).
    - One order timeline, with after-sale states for each item (R-03).
    - Pro-rated refunds (R-04).
    - One pending payment order per customer (R-09).
    - Deterministic test values (R-10).
    - WCAG 2.1 AA and Core Web Vitals targets (R-27, R-28).
11. **`intent.md` v2.0 rewritten** with a glossary, quality targets, accepted risks, the decision log, the review resolutions and the team decisions. Status: READY FOR SPEC.

## 2026-10-06 — Functional specification

12. **`spec.md` written** with about 300 numbered requirements, the domain model, state machines, a logical API, validation, error catalogue, edge cases, user flows and worked pricing/refund examples (numbers verified by script). The first attempt failed because the output was too large; it was rewritten in sections. 64 values and interpretations were recorded as spec decisions (SD-n).
13. **Three open questions (SQ-1 to SQ-3) resolved by the owner:**
    - **Password reset:** the customer picks their question from the full list (D-42).
    - **Accounts and data:** no pre-made demo accounts; a ₹500 sign-up credit grant; personal data purged after 30 days of inactivity (D-43).
    - **Catalogue size:** at least 6 products per subcategory, at least 48 per category listing, about 1,800–2,500 products in total (D-44).
14. **`spec.md` v1.1** (READY FOR IMPLEMENTATION PLANNING) and **`intent.md` v2.1** (APPROVED) updated.

## 2026-10-06 — Repository

15. **First commit.** The owner initialised the Git repository with remote `github.com/ChiragKumar601/ecommerce-app`. `README.md`, `intent.md` and `spec.md` were committed as `176dfb1` and pushed to `origin/main`.
16. **Implementation paused.** The owner asked to implement "the approved plan.md", but no plan existed yet. Work stopped and the owner was asked how to proceed.

## 2026-10-06 — Implementation plan

17. **`plan.md` v1.0 drafted:** Next.js, PostgreSQL and Prisma in a monorepo, with 21 stages. It mapped all 290 spec IDs to steps. The owner asked for a local-first approach (deployment later) and a tech-stack list, and both were added.
18. **Owner changes:** use **React Router** instead of Next.js routing; a database that **needs no installation** (SQLite).
19. **Architect review of `plan.md`:** 30 findings (PR-01 to PR-30). They covered new owner directives, ordering and dependency errors, steps that were too large, missing libraries, unnecessary complexity, and two conflicts with the spec (a footer image credit, and contradictory rating-aggregate wording). Verdict: NEEDS REVISION.
20. **Owner decisions:**
    - **Backend:** Express.
    - **Shared code:** a minimal `shared/` folder with validation schemas and types only.
    - **Images:** reuse within a subcategory is allowed, as long as it doesn't look repetitive.
    - **Image credit:** on `/demo-help`, with the footer unchanged.
21. **`plan.md` v2.0 rewritten:**
    - **Folders:** separate `frontend/` (Vite + React + React Router), `backend/` (Express, Prisma + SQLite, worker) and `shared/`, with separate run scripts.
    - **Stages:** 23 small stages.
    - **Review findings:** all 30 resolved.
    - **Coverage:** script-checked against all 290 spec IDs.
    - **Verdict:** READY FOR IMPLEMENTATION.
    - **Keys still needed:** a Pexels key before S3.7 and a Mapbox token before Stage 13.

## 2026-10-06 — Development log

22. **This log created** (`prompts/development-log.md`), with the owner's working rules recorded above. `plan.md` and this log were committed.
23. **Owner direction on UI and Git:**
    - The UI must be exceptionally polished, consistently themed and uniform across every route (same theme, components and styling), and fully responsive.
    - Each stage is pushed directly to `main`.
    - **Plan changes:**
      - `plan.md` gained **§8.5 Design system and theming**: tokens, palette, type scale, motion, a single `components/ui` library and a dev-only styleguide route.
      - Design system step **S4.3** added.
      - Font plan: one self-hosted variable font.
      - Stage rules now require tests and the design check before completion, then a log entry, then a commit pushed to `main` (OD-9, OD-10).

## 2026-10-06 — Stage 0: Foundation (complete)

24. **Stage 0 built:**
    - pnpm workspace with separate `shared/`, `backend/` and `frontend/` packages, and root scripts per folder (`dev:frontend`, `dev:backend`, `dev:worker`, `test:*`, `db:*`).
    - ESLint import-boundary rules, verified to reject frontend ↔ backend imports.
    - Express 5 API with `/api/v1/health` and a separate worker process.
    - Prisma 7 + SQLite with WAL, busy timeout and foreign keys, plus a per-test database helper.
    - Vite + React 19 + React Router 7 + Tailwind 4 + TanStack Query frontend, with the `/api` dev proxy.
    - Playwright starting the backend, worker and frontend.
    - GitHub Actions CI.
25. **Technical findings during Stage 0:**
    - `better-sqlite3` couldn't be installed: there is no compiler and no matching prebuilt binary. Switched to Prisma's **libSQL adapter** (SQLite-compatible file database, prebuilt via npm), so the plan is unchanged.
    - Prisma 7 supports `Json` and `enum` on SQLite, so `Json` columns will be used for payloads.
    - Versions: TypeScript 5.9.3 (typescript-eslint doesn't support TS 7 yet), ESLint 9, React Router 7.18, Vite 8, Vitest 5, Zod 4, Express 5.2, Prisma 7.10.
26. **Stage 0 tests:**
    - lint, typecheck: pass
    - shared: 1/1, backend: 4/4, frontend: 2/2
    - E2E smoke: pass on Chromium, Firefox and mobile
    - **WebKit is pending.** The host needs system libraries (`sudo pnpm exec playwright install-deps webkit`), which only the owner can install.
27. **Owner chose to skip local WebKit testing.** The host libraries need `sudo`, which can't be entered from the session. WebKit is now opt-in locally (`PW_WEBKIT=1`) and always runs in CI. **Open item:** run the WebKit E2E suite locally before final acceptance (S22.1).
28. **Stage 0 complete.** Final checks: lint, typecheck, unit tests (shared 1, backend 4, frontend 2) and E2E (Chromium, Firefox, mobile) all pass. Committed and pushed to `main`.

## 2026-10-06 — Stage 1: Shared schemas and backend domain kernel (complete)

29. **Built:**
    - **`shared/validation`:** every spec §12 field rule with its exact message (name, email, phone with `+91` normalisation, login identifier, password, security answer normalisation, age, date of birth, address fields, card number with Luhn check, name on card, expiry, CVV with Amex, UPI, coupon and gift card codes, OTP, search, rating, review text, return comment, support message). A few secondary messages that §12 doesn't word (for example "Use up to 100 characters") are marked "UX" in the code.
    - **`shared/types`:** `Money`, all 41 §13.1 error codes plus `INTERNAL_ERROR`, the error envelope, the `QuoteChange` list format, and the order, return, payment and refund status unions.
    - **Backend `domain/`:**
      - `money`: paise arithmetic, half-up rounding, largest remainder, Indian ₹ formatting
      - `time`: IST dates
      - `clock`: injectable, with a fake for tests
      - `random`: seeded, with weighted picks
      - `ids`
      - `errors`: the §13 catalogue with HTTP statuses, `AppError`, and a customer-safe envelope that exposes only allow-listed details
30. **Bugs caught by tests and fixed:**
    - The name rule rejected Indic names, because Devanagari vowel signs are Unicode combining marks. It now allows `\p{M}`.
    - `cryptoRandom` exceeded Node's `crypto.randomInt` range limit.
31. **Stage 1 tests:** lint and typecheck pass. shared 26/26, backend 23/23 (including the spec's worked-example coupon and bank-offer splits and tax portions), frontend 2/2. Committed and pushed to `main`.

## 2026-10-06 — Stage 2: Pure business engines (complete)

32. **Built** (`backend/src/domain`, pure, no I/O):
    - **Pricing engine** `pricing/quote.ts` (PRC-001…012): coupon eligibility, discount and largest-remainder shares; delivery charge with a whole-rupee free-delivery shortfall; bank offer (applied, available-with-potential, or not eligible with a reason); wallet (gift card, then credits); offer withdrawn when the wallet covers the total (PRC-009); tax portion including 18% on delivery; COD rule.
    - **Change list** `pricing/quoteDiff.ts` (CHK-002, PAY-006).
    - **Refund allocation** `refunds/allocate.ts` (RFD-001…004, 007).
    - **Declarative state machines** for order, line, return, payment attempt, refund, gift card, review and lock (§7). Anything not listed → `ACTION_NOT_ALLOWED`.
    - **Helpers:** discount %, the Recommended score, and the search tokenizer with bounded Levenshtein distance (SRC-004).
33. **Stage 2 tests:**
    - backend 85/85, including **WX-1 to WX-4 to the exact paise**, EC-08 to EC-11, the ₹1,999.00 / ₹1,999.01 delivery boundary, a 300-cart property test (shares sum exactly; line nets plus delivery equal the total), exhaustive state × event tests for every machine, and typo cases ("snaekers" → "sneakers").
    - shared 26/26, frontend 2/2, lint and typecheck pass.
34. **Implemented literally, worth knowing (PRC-009):** if credits or a gift card would cover the total *with* the HDFC offer but not *without* it, the offer is withdrawn and the small remainder is paid by card without the offer, exactly as PRC-009 states.

## 2026-10-06 — Local verification checkpoint

35. **Full local check requested by the owner.** Starting from a clean `pnpm install`:
    - Lint, typecheck and all tests pass (shared 26, backend 86, frontend 2).
    - The frontend and backend production builds succeed, and the compiled API and worker run.
    - `pnpm db:migrate` creates the SQLite file.
    - `dev:backend`, `dev:worker` and `dev:frontend` run together, with the proxy working end to end.
    - E2E passes on Chromium, Firefox and mobile.
36. **Latent bug found and fixed.** The compiled backend couldn't load runtime code from `shared/` (`ERR_MODULE_NOT_FOUND`), because `shared/` is TypeScript source with `.js` import specifiers. Nothing called it yet, but Stage 4's request validation would have crashed in production builds. Fix: `shared/` now imports with `.ts` extensions, and the base tsconfig sets `allowImportingTsExtensions`, `rewriteRelativeImportExtensions` and `erasableSyntaxOnly`. Node 24 then runs `shared/` directly, with no build step. A regression test loads `@app/shared` on plain Node.

## 2026-10-06 — Stage 3: Database, config and catalogue seed (in progress)

37. **Built and tested (not yet committed):**
    - **Migration M1–M3:** config, content, reference, catalogue and reviews tables, plus hand-written CHECK constraints (stock never negative or over-held, price ≤ MRP, rating 1–5). The tests show the database rejects violations.
    - **Catalogue tree:** 6 sections, 68 categories, 386 subcategories from the README and T-6, with a validator.
    - **Config:** spec §5 settings, coupons, HDFC offer, tax rates, return policy, delivery zones.
    - **Reference data:** 36 states/UTs; **201 real pincodes covering every state and UT, each verified against India Post data** via api.postalpincode.in, because data.gov.in's API was unreachable; 8 security questions; blocked words.
    - **Demo data:** 15 Luhn-valid test cards (3 bank/type groups × 5 outcomes), 4 test UPI IDs, 6 gift card codes.
    - **Content:** 6 hero slides (one to Best Seller Styles), 30 Shop by Category cards, popular searches, footer, 8 placeholder pages (privacy states the 30-day purge), 16 FAQs.
    - **Deterministic product generator:** fictional brands, product families, size systems, colour siblings, out-of-stock items, mirror rules for cross-section listings, curated recommendations.
    - **Reviews:** about 50k seeded reviews, with aggregates computed from the rows.
    - **Image assignment:** OD-6 guardrails, unit-tested.
    - **Image fetch script:** resumable and rate-limit-aware (418 queries).
    - **Scripts:** `db:seed`, `config:sync` and `seed:verify`.
38. **Results:**
    - The seed loads 2,930 products, 8,568 variants and 50,057 reviews in about 21 s, and `seed:verify` passes.
    - Tests: backend 111, shared 26, frontend 2. Lint and typecheck pass.
    - Bugs fixed along the way: Prisma 7 needs `prisma generate` after migrate (added to `db:migrate`); some families pointed at size guides that didn't exist.
39. **Waiting on the owner:**
    - **(a) A D-44 conflict.** With 68 categories each needing ≥ 48 products, the floor is about 2,830 products even with reasonable cross-listing, so "about 1,800–2,500" can't be met together with the minimums. The current output is 2,930.
    - **(b) The Pexels API key** for S3.7 (images).
40. **Images without a key (OD-11).** Pexels has paused new API keys, so the owner chose **Openverse + Wikimedia Commons**. Findings:
    - Openverse allows only 200 anonymous requests a day and returned weak matches (a *map* for "kurta").
    - Wikimedia Commons is therefore primary, with Openverse as a small top-up.
    - Only licences allowing commercial use and modification are kept (CC0, public domain, CC BY, CC BY-SA). Off-topic titles (maps, logos, museum pieces, portraits) and real-brand titles (Adidas, Dior, Yeezy…) are filtered out.
    - Each photo is downloaded once and resized to a ~900 px WebP (`sharp`; format change only) in `backend/storage/catalogue`, served by the backend at `/media/catalogue` with immutable caching and proxied by Vite.
    - The manifest stores author, licence, source page and download URL per image, so a fresh clone can rebuild the files.
    - **Reuse rule relaxed per the owner** ("reuse if needed, avoid if you can"): primaries stay unique or shared by at most 2 where the pool allows; smaller pools reuse more, but never put the same primary side by side. Over-reuse is now a warning, not an error.
    - Plan updated (OD-11; A-4 superseded; S3.7 and S12.6 credits).
41. **Catalogue size (OD-12).** The owner said images are only for appearance and the UI is the focus, without choosing between the D-44 options. Applied the recommended option: **keep the ≥ 6 / ≥ 48 minimums, ~2,930 products**. Recorded as a team call the owner can override.
42. **Fetch performance:** one download at a time took about 22 s per query (~2.5 h). Downloading 4 in parallel per query brings it to about 9 s per query. The fetch resumed from its manifest without refetching.
43. **Owner: use existing images, reuse allowed, at least 150 distinct (OD-13).** The full fetch was stopped. The 395 images fetched so far were all from Men, so a quick category-level batch was added for the other sections.
44. **Bug: two fetch processes overwrote each other's manifest.** Stopping by name had only killed the `npx` wrapper. Fixed by stopping by exact PID and adding a **lock file** to the fetch script (a second run is refused; tested).
45. **Spot-check found many irrelevant images** from the broad category/section searches: a lightning storm for a ceiling light, a Ferris wheel for decorative lights, a jockey for slippers, a building for shaving products, a military jacket for diapers, plus photos of identifiable real people (concert, celebrity), which a CC licence doesn't cover for shop use.
46. **Owner chose: relevance filter + fetch the rest.**
    - A photo is used only if its title names the product type (head noun plus synonyms), and event titles are blocked; this applies to fallback photos too. Tested with every bad example from the spot-check.
    - Products with no relevant photo get an on-theme section placeholder SVG, served at `/media/placeholder`.
    - Hero slides and cards have their own relevance keywords.
    - The fetch counts only relevant photos and asks Wikimedia for 50 candidates per search.
    - The verifier counts only real photos towards the ≥ 150 minimum, and placeholder products are exempt from the 2–4 images rule.
47. **Owner: "reuse images if needed, it doesn't matter if they match — finish it" (OD-14).**
    - The relevance-filtered fetch was stopped. The lock file was released cleanly, and 1,531 photos were kept, with no missing files.
    - Assignment now prefers relevant photos, then the product's own and fallback searches, then any photo. Event photos are always excluded (real people's image rights). The placeholder is used only if the manifest is empty.
    - Result: **every product has real photos, 887 distinct images (≥ 150, OD-13), 0 placeholders.** The seed takes about 12 s and `seed:verify` passes.
48. **Test fix:** this session forces coloured output, so the shared-runtime test's child process printed `42` with colour codes. The test now prints plain strings and no longer depends on the terminal.

## 2026-10-07 — Stage 3 complete

49. **Stage 3 verified and committed:**
    - lint and typecheck pass; shared 26, backend 121, frontend 2; E2E 3/3.
    - `db:seed`: 2,930 products, 8,568 variants, 50,057 reviews, 8,906 product images (887 distinct), 1,000+ licensed images credited by author and licence.
    - `seed:verify` passes; the only warning is the total being above "about 2,500" (OD-12).
    - Committed: the manifest of attribution metadata, placeholders and seed sources. Image files are gitignored and rebuilt by `pnpm images:fetch`, which restores missing files from the manifest.
    - Pushed to `main`.

## 2026-10-07 — Stage 4: Platform layers, design system, app shell (complete)

50. **Owner: complete up to Stage 16 as fast as possible**, still testing, logging and committing each stage.
51. **Backend platform:**
    - Express pipeline: helmet, request IDs, structured logging with secret redaction, JSON limit, cookie-parser, CSRF Origin check (allowed origins via `FRONTEND_ORIGIN`), zod `validate` with field errors, and an error handler mapping everything to the §13 envelope (unexpected errors → generic message, static 404s → `NOT_FOUND`).
    - SQLite fixed-window rate limiter with Retry-After.
    - `SettingsStore` with a 60 s cache and a catalogue-version change event.
    - `AppContext` injection (DB, clock, random, logger, settings), so tests control time.
    - `GET /api/v1/site` (brand, demo banner).
    - The `RateLimitBucket` table moved forward from M4 (S10) because S4.2 needs it — a small plan correction.
52. **Design system:**
    - `theme.css` tokens: warm neutrals, rosewood brand, sale, success, warning, danger and info colours (AA contrast); Inter variable type scale; radii; shadows; motion; layout gutters.
    - `components/ui`: Button/IconButton (loading state), FormField (linked label, hint and error), Input, Textarea, Select, Checkbox, Radio, Switch, RangeSlider, Badge, Chip, Card, Dialog, ConfirmDialog, Sheet, Popover, Tooltip, Tabs, Accordion, Toast with Undo, Skeleton, Spinner, EmptyState, ErrorState, InlineMessage, PriceTag, RatingBadge, QuantityStepper, Stepper, PageLayout, PageHeader, Section, Breadcrumbs.
    - Dev-only `/dev/styleguide`, excluded from production.
    - Added `lucide-react` (icons) and `@fontsource-variable/inter` (self-hosted font).
53. **Shell:** non-dismissible demo banner, wordmark logo linking home, skip link, `Seo` (titles and canonical link from route handles), Not found page with search and a home link, route error page, Toaster. The API client has the error envelope, idempotency keys, a session-expiry hook and a generic network message.
54. **Bugs found and fixed:**
    - **Invisible button labels**, caught by screenshot review: tailwind-merge dropped `text-white` because it didn't know the custom `text-body` scale. Fixed with `extendTailwindMerge` and a regression test.
    - **Misplaced files:** a parallel tool call wrote frontend files into `backend/src`. They were moved, and writes now always use absolute paths with no parallel writes.
55. **Tests:** lint and typecheck pass; shared 26, backend 131, frontend 12; E2E 21 (banner at 360/768/1024/1280 with no horizontal scroll, Not found, titles, axe WCAG 2.1 AA scan) on Chromium, Firefox and mobile. Landing JS is 135 KB gzip (budget 170).

## 2026-10-07 — Stage 5: Navigation, footer, content pages (complete)

56. **Owner (again): complete everything up to Stage 16.**
57. **Built:**
    - **Backend:** `GET /nav` (active tree, section hrefs `/shop/<section>`, cached per catalogue version), `GET /site` (brand, banner, footer, popular searches, sample company details), `GET /content/pages/:slug`, `GET /faqs`.
    - **Frontend header:** logo, Radix NavigationMenu mega menus (hover/keyboard/Escape, columns of categories and subcategories, "Shop all", scrolls inside the panel), an always-visible desktop search bar (Enter → `/search?q=`), Profile/Wishlist/Bag icons with labels and a bag badge (wired up in S11).
    - **Mobile:** slide-out drawer with nested accordions, focus trap and focus returned to the menu button; full-screen search overlay.
    - **Footer** in the LND-007 order.
    - **Content pages:** a safe mini-Markdown renderer and the "Placeholder content" label.
58. **Bugs fixed via screenshots and tests:**
    - The mega menu panel had zero height (missing the Radix viewport height variable).
    - The logo wrapped onto two lines at 390 px.
    - **4 px of horizontal scroll at 360 px.** Fixed with a compact "W&Co." wordmark below 400 px, keeping 44 px touch targets per FE-004.
    - Drawer focus return made explicit.
    - Test fixes: exact role names, waiting for site data, and scoping to `main`.
59. **Tests:** lint and typecheck pass; backend 135, frontend 12, shared 26; E2E 50 passed on Chromium, Firefox and mobile (4 desktop-only tests skipped on mobile), including axe.

## 2026-10-07 — Stage 6: Listings (complete)

60. **Backend:**
    - **Catalogue read model** (`services/catalogue/snapshot.ts`): active products, nodes, variants and images, held in memory per catalogue version and warmed at server start. Stock refreshes on a 3 s TTL and ratings on 30 s (within REV-011's 1 minute). Purchase decisions will always re-check the DB. Loading uses flat queries joined in memory, because Prisma's nested includes exceed SQLite's bound-parameter limit at 2,930 products.
    - **`GET /products`** (`listProducts`):
      - Scopes: node, all, best-seller, bank-offer, search (search is used from S8).
      - Filters: gender, category, brand, price on the card price, colour, discount buckets, size (only available variants), rating, in-stock, inclusive sizing, and the bank-offer chip.
      - Facets are disjunctive: each facet ignores its own selection. Facets with no values are omitted.
      - Sorts follow PLP-003, with out-of-stock always last and a stable id tie-break.
      - Pages of 24 with an opaque cursor, plus `totalCount`.
      - `prune=1` drops filter values that have no matches (PLP-009). Chip labels come from the API.
    - Card alt text describes the product rather than the stock photo's original caption.
    - Steady-state listing latency in process is p50 15 ms / p95 23 ms on the full catalogue (gate: 200 ms).
61. **Shared:** listing query schema and response types; zod-free listing constants (`shared/src/constants`). `@app/shared` is now `sideEffects: false`, so client imports don't pull zod into the main bundle.
62. **Frontend:**
    - **Routes:** `/shop/:section`, `/shop/all`, `/:section/:category/:sub?`, `/collections/best-seller-styles`, `/offers/hdfc`. Static loaders run in parallel with the lazily loaded page.
    - **ListingPage:** desktop sidebar ≥ 1024 px; Filter and Sort bottom sheets below that, staged until Apply; chips with scope-preserving Clear all; "N items" count; previous results kept (dimmed) while a new filter loads.
    - **Infinite grid:** IntersectionObserver, a "Load more" fallback when a page fails, and "You've seen all items" at the end.
    - **PLP-009 carry-over:** applies only on forward navigation to a *different* listing in the same section, pruned by the API. Back/forward and reloads show exactly what the URL says.
    - **`ProductCard`** and **guest wishlist** on the new `lib/device-store.ts` (30-day expiry, in-memory fallback, cross-tab sync).
    - New `--header-h` token for sticky offsets.
63. **Bugs found and fixed while testing:**
    - Prisma parameter-limit crash.
    - React Compiler lint: ref read during render, and setState in an effect. Replaced with `keepPreviousData` and a keyed remount.
    - A `ul role="radiogroup"` orphaned its `li` items (axe).
    - Clear all re-applied carried filters on the same listing.
    - **Scroll restoration on Back failed** because route errors replaced the whole layout, including `<ScrollRestoration>`. Error boundaries now sit inside the layout, which also keeps the header and search on 404s (GLB-005). That exposed a title handle throwing without loader data, so `Seo` now tolerates it and error pages set their own title.
    - A focusable invisible "Apply price" button was removed.
    - Main bundle: zod had been pulled in (189.8 KB gzip) → 163.4 KB after the fix (budget 170; the Stage 5 baseline rebuilt today is 152.5 KB).
64. **Tests:** lint and typecheck pass; shared 26, backend 154 (+19 listing integration tests on a hand-written fixture: every scope, filter, facet, sort, cursor and pruning), frontend 17 (+5 URL-state tests); E2E 77 passed / 10 viewport-skipped on Chromium, Firefox and mobile, including PLP-007/008/009/010/014, the bank-offer chip and axe. **Not done:** Lighthouse is not installed yet. The performance gate for this stage was the bundle budget plus API latency; Lighthouse runs are deferred to Stage 22 (hardening).

## 2026-10-07 — Stage 7: Landing page (complete)

65. **Gap from Stage 6 closed:** the seeded Shop by Category links use `/shop/all?nodes=…`. Added a `nodes` scope to ListProducts: it narrows "all" to those nodes, the title is built from the node names, and unknown ids are ignored. On the client it's a scope key: kept by Clear all and never shown as a chip.
66. **Backend:** `GET /content/landing` returns active hero slides in order (at most 8, R-38), the active bank offer within its validity dates, and active cards in order. It's read on every request (60 s HTTP cache), so data changes appear without code changes.
67. **Frontend:**
    - Landing page in LND-001 order. The footer comes from the layout.
    - **`HeroCarousel`:**
      - Crossfade, autoplay every 5 s.
      - Pauses on hover, on focus inside, and via Pause/Play.
      - Previous/Next controls (44 px), slide dots, touch swipe.
      - Inactive slides are `inert`; the live region is polite only while paused.
      - The first image is eager with `fetchpriority=high` (LCP); a reduced-motion preference disables the transitions.
    - **Bank-offer tile:** the whole tile links to `/offers/hdfc`; "T&C apply" opens the terms in a Dialog.
    - **Shop by Category:** 3:4 crops, 2/4/5/6 columns at <768/768/1024/1280, and the whole card is a link.
    - Image alt text is empty for decorative photos next to their text, so stock-photo captions don't mislead screen-reader users.
68. **Tests:** lint and typecheck pass; shared 26, backend 157 (+3: landing content, a data-added card appears, inactive hidden, slide cap 8; nodes scope), frontend 17; E2E 104 passed / 10 viewport-skipped, including landing order, carousel controls/autoplay/pause, bank-offer terms and link, card navigation, column counts at four widths, and axe. Main bundle 165.8 KB gzip (budget 170). Lighthouse is still deferred to Stage 22.

## 2026-10-07 — Stage 8: Search (complete)

69. **Search index** (`services/search/index.ts`), built from the catalogue snapshot and rebuilt with it per catalogue version (warmed at start-up):
    - Inverted index with field weights: name and brand 5, node names 4, colour 3, subtitle 2, specification values 1. Specification values were added to the snapshot.
    - Vocabulary bucketed by length. Hyphenated words are also indexed joined ("T-Shirt" → "tshirt"). Light plural stemming on both sides (dresses→dress, watches→watch). Stopwords are dropped.
    - **Typo tolerance (SRC-004):** ≤ 5 characters → 1 edit, longer → 2, only for words of 3+ characters. **T-decision:** edits are measured as optimal-string-alignment distance (Levenshtein plus adjacent swaps), so "jaens" is one typo from "jeans". Only the closest candidates count; on ties, words sharing the first letter win ("speakr" → speaker, not sneaker). An exact word suppresses fuzzy expansion, so exact matches always rank first.
    - **Multi-word queries:** all words must match. If nothing matches all of them, products matching the most words are returned.
    - Build ~110 ms; lookup p95 < 50 ms (tested).
70. **API:**
    - `scope=search&q=` in ListProducts uses every listing capability with the matches as scope (SRC-006); "Recommended" orders by relevance first.
    - Searching within a node = the `category` filter accepting any node in search scope, shown as a removable chip (SRC-008).
    - `GET /search/suggest`: categories (with path context), brands (→ `/search?q=<brand>&brand=<slug>`), products (image, brand, price), popular searches; minimum 2 characters; at most 8, in group order.
    - Suggestion latency on the dev server: median ~10 ms, worst ~100 ms (gate 200 ms).
71. **Frontend:**
    - **Header search** is an ARIA combobox with a 250 ms debounce. The empty-focus view shows 5 recent and 5 popular searches with "Clear recent searches". While typing, matching recent searches come first, then the server groups, capped at 8.
    - Arrow keys, Enter and Escape work; Escape closes the list without clearing the field. The mobile overlay shows the list inline.
    - **Recent searches** are stored on the device (≤ 10, case-insensitive de-duplication, newest first) after a search with results. Account storage comes in S10.
    - **`/search` route:** results reuse ListingPage, with `q` as a scope key kept through filter changes and Clear all. Zero-results page (SRC-007) and an empty-query prompt (SRC-010).
    - `EmptyState` gained a heading `level`, so these pages and Not found have an h1. The header search box is keyed by `?q`.
72. **Bugs fixed:**
    - Filter changes dropped `q`.
    - Escape in a `type=search` input cleared the text and reopened the list.
    - Category facet ordering produced NaN for added nodes.
73. **Tests:** lint and typecheck pass; shared 26, backend 201 (+40 index: a 33-case typo set over the full generated catalogue, OSA, ranking, fields, stemming, latency; +4 search/suggest API), frontend 17; E2E 119 passed / 16 viewport-skipped, including UF-02 (typo → suggestions → results → recent → clear), keyboard selection, product/category suggestions, filters on results, zero results, empty query and the mobile overlay. Main bundle 167.9 KB gzip (budget 170: later pages must stay lazy).

## 2026-10-07 — Stage 9: Product detail page, read side (complete)

74. **Backend:**
    - **`GET /products/:id`:**
      - Brand, name, subtitle, description, material & care, specifications, ordered images (alt text describes the product), and variants with `available`.
      - Default variant = lowest-priced available.
      - Rating aggregate with distribution.
      - Offers: bank offer only when eligible and valid; up to 3 valid coupons whose nodes include the product.
      - Return eligibility line, size guide, colour siblings (same style group).
      - Breadcrumb hints: the primary chain, plus every listing node containing the product, with labels.
      - **Inactive products** return `active: false` with no purchase data (PDP-013).
    - **`GET /products/:id/recommendations`** (also works for inactive products):
      - Similar: same subcategory, card price within ±30%.
      - Related: same brand or section.
      - Bought together and Complete the look: curated.
      - Each rail ≤ 12, in-stock first, ranked by the Recommended score.
    - **`GET /products/:id/reviews`:** visible only, 10 per page; sort recent/highest/lowest; star and with-images filters.
    - **`GET /pincode/:pin`:** IST delivery date by zone, the free-delivery rule, the unserviceable message, and 6-digit validation.
75. **Frontend `/p/:slug-:id`:**
    - Static loader, lazy page. Edited or stale slugs redirect to the canonical URL. Title "<Product> – <Brand>".
    - **Gallery** with thumbnails and a **full-screen viewer:** click to zoom at the pointer (2.2×), pinch allowed, swipe/arrows, Escape.
    - Size selector: out-of-stock sizes disabled, struck through and named "…, Out of stock"; "n left" hint for low stock; One Size auto-selected. The price follows the selected (or default) variant, plus "Inclusive of all taxes".
    - More-colours swatches, size-guide dialog with a table.
    - **Pincode check:** remembered on the device and re-checked on return.
    - Offers block with a T&C dialog, return line, details accordion.
    - **Reviews:** aggregate with 5→1 bars; star / with-images filters, sort, Load more.
    - Four recommendation rails (horizontal snap scrolling with desktop scroll buttons).
    - Device wishlist button.
    - **Breadcrumbs (NAV-010):** product links carry the listing path in router state. If the product belongs to that listing, the crumbs follow it (labels from the API); otherwise the primary path.
    - Add to Bag / Buy Now arrive with the bag in S11.
76. **Bugs found and fixed:**
    - The main image was vertically centred inside a stretched grid cell (button default). Now pinned to the top.
    - Tests scoped where the footer repeats "Easy 14-day returns", and wait for the PDP to render before counting sizes.
77. **Bundle discipline (FE-006):** the main chunk had reached 168.5 KB because shell components imported the `ui` barrel, pulling every Radix primitive into the initial chunk.
    - Home and ContentPage are now lazy; their loaders live in `features/content.ts`.
    - Plain controls moved to `ui/input.tsx`.
    - Shell files import specific ui modules.
    - Measured in a production preview, JS downloaded on `/`: **157.2 KB gzip** (budget 170). PLP is 171 KB and PDP 174 KB; the budget applies to the landing route. Lighthouse is still deferred to Stage 22.
78. **Tests:** lint and typecheck pass; shared 26, backend 208 (+7 PDP API: variants/default, offers eligibility, returns/colours/breadcrumb nodes, inactive and unknown products, recommendation rules, reviews sort/filter/hidden, pincode); frontend 17; E2E 149 passed / 16 viewport-skipped, including PDP content and title, canonical redirect, sizes, viewer, pincode (and remembered), offers/size guide/specs, reviews, rails, wishlist and axe.

## 2026-10-07 — Owner request: complete Stages 10–16

79. **Owner asked for Stages 10 through 16 to be completed** in this session, each tested, logged and committed as before. The Mapbox token for Stage 13 isn't available yet, so the map step will turn on only when `VITE_MAPBOX_TOKEN` is set; the manual address path (ADDR-003, always required by the spec) works without it.

## 2026-10-07 — Stage 10: Accounts and authentication (complete)

80. **Backend:**
    - Migration M4: `Account` (identifier CHECK), `Session` (the cookie holds a random token; the table stores its SHA-256), `PasswordResetToken`, `AuthThrottle`, `RecentSearch`, `IdempotencyKey`, `CreditLedgerEntry`.
    - Argon2id (`@node-rs/argon2`) for passwords and normalised security answers. Every login and reset attempt costs exactly one Argon2 verify (a dummy hash for unknown identifiers).
    - Sign-up with the ₹500 `signup_grant`. Login with identical responses for unknown identifiers and wrong passwords; account lockout after 5 failures; a client-keyed lockout for unknown identifiers (SD-38); rate limits.
    - Password reset: the question is chosen from the full list, failures are neutral, 5 wrong answers lock it, a single-use reset token sets the new password, every session is revoked, and the notice is shown at the next login.
    - Session middleware: 60-minute idle and 24-hour absolute expiry, activity written at most once a minute. Logout, `GET /auth/session`, and account recent searches.
    - E2E now runs on its own database (`e2e.db`): a snapshot of the dev catalogue without accounts, with raised rate limits.
81. **Frontend:**
    - Login, sign-up and forgot-password pages, the `LoginPromptDialog`, `intent-resume`, route guards (`/account` → `/login?returnTo=…`), and logout with confirmation.
    - On SESSION_EXPIRED, a login dialog opens on the current page and the interrupted request is re-sent with the same idempotency key.
    - Recent searches are account-backed for customers and merged from the device at login.
    - The Profile icon gets an unseen-updates dot, fed by the session (orders arrive in S16).
    - **Implementation choice:** forms use a small `useZodForm` hook over the shared zod schemas instead of react-hook-form. It's the same behaviour (validate on blur and submit, field errors linked and announced, inputs kept except secrets) with no extra dependency.
82. **Bug fixed:** the constraints test created a review for an account that didn't exist, which the new M4 foreign key rejected. The test now creates the account and also checks the one-identifier CHECK.
83. **Tests:** lint and typecheck pass; shared 26, backend 225, frontend 19 (+2 intent-resume); E2E 161 passed / 16 viewport-skipped, including sign-up validation, guard → login → return, the wrong-password message, logout confirmation, UF-13 (neutral wrong question, normalised answer, notice at next login) and axe on the auth pages. Auth pages checked at 360 and 1280 px with no horizontal scroll.

## 2026-10-07 — Stage 11: Bag, wishlist, merge (complete)

84. **Backend:**
    - Migration M5: `Bag`, `BagLine` (quantity CHECK 1–10, `lastSeenUnitPrice`), `WishlistEntry`.
    - `services/pricing.ts` loads the delivery config, bank offer, coupons, line data and tax rates (most specific node wins) for the pure quote engine, and formats the quote as `{paise, display}` (API-005).
    - `services/bag.ts`: one set of line rules for guests and customers:
      - add capped at min(10, available) with "Only n available" / "Maximum 10 per item"
      - quantity changes capped to available
      - 50-line limit
      - flags: No longer available, Out of stock, Only n left (checkout blocked)
      - "Price changed from ₹X to ₹Y", reported once
      - coupon apply with specific reasons, and auto-removal with "Coupon X removed: reason"
      - an available-coupons list with each coupon's status
      - bank-offer preview and the free-delivery nudge
    - Guest bags are priced through `POST /bag/guest-quote` and never stored (PR-25). The server returns the normalised device lines.
    - Wishlist API (list 24 per page with statuses, ids, add/remove, move to bag with a size check, guest view).
    - Login and sign-up merge the guest bag (sum and cap with messages, 50-line limit with a message, flagged lines carried over), wishlist (union) and coupon (the account's coupon wins).
    - The per-customer coupon count returns 0 until orders exist (S15).
85. **Frontend:**
    - `useBag` / `bagAction` / `useBagCount` work over the device store (guest) or the API (customer); the header badge counts units.
    - Bag page: lines with quantity, Remove with a 5-second Undo, Move to Wishlist, flags and fix actions, coupon box and available-coupons dialog, bank-offer preview, price summary with the tax line and nudge, guest pincode delivery block, empty state, and Proceed to Checkout (guests get the login prompt; the `checkout` intent resumes).
    - Wishlist page: cards with statuses, Remove, Move to Bag with a size picker, pages of 24, empty state.
    - Product page: Add to Bag (size required, then "Go to Bag"), Buy Now (login prompt and resume for guests; goes to `/checkout/buy-now`, built in S14), stale-data handling and "Price updated".
    - The account wishlist toggle is optimistic and reverts on error.
    - Customer delivery details from the default address follow in S13 (PR-09).
86. **Tests:** lint and typecheck pass; shared 26, backend 241 (+16 bag/wishlist/merge: guest quote amounts and tax, add caps, flags, price change, every coupon reason and auto-removal, bank-offer preview, stored bag operations, line limit, wishlist statuses and move-to-bag, merge with caps and messages, coupon precedence, EC-15); frontend 19; E2E 176 passed / 16 viewport-skipped, including UF-01, the bag page flows, wishlist move-to-bag, UF-03 (guest bag → login prompt → merged account bag) and axe on the bag. Bag and PDP checked at 360 and 1280 px with no horizontal scroll.

## 2026-10-07 — Stage 12: Profile, wallet, cards, support, demo help (complete)

87. **Backend:**
    - Migration M6: `SavedCard` (masked only; one default via a partial unique index), `AccountGiftCard` (balance never negative, enforced by triggers), `GiftCardTxn`, `SupportRequest`, and `Account.deletionRequestedAt`.
    - Profile read and update: changing email, phone, password or security question needs the current password; at least one identifier; duplicates rejected with the profile message; age ≥ 18.
    - Credits ledger (balance plus 20 per page). Gift card redeem (case-insensitive; invalid / already redeemed / inactive) and list (masked code, balance, status with lazy expiry, transactions).
    - Saved cards: only designated test cards, with a SHA-256 reference instead of the number; the CVV is validated and dropped; limit 5; removing the default promotes the most recent card; set default.
    - Support requests numbered `SR-YYMMDD-XXXXX`; `account_deletion` records the request for the S21 purge.
    - `GET /demo-help`: test cards, UPI IDs, gift codes, return tags and image credits.
    - **Idempotency middleware (API-003):** claims the key before the handler runs, so a concurrent duplicate waits and gets the same response; a replay sends the stored response; 5xx releases the key. Used on gift-card redeem and support requests now, and on Pay, Retry, Cancel and Return later.
88. **Frontend:**
    - Profile home with every PRF-001 entry (plus the PRF-007 dot on Orders), Edit Profile (the current-password field appears only for sensitive changes), Credits, Gift Cards (redeem form plus a list with transactions), Saved Cards (add with the demo warning, set default, remove with confirmation), and Contact Us (FAQs by topic, request form, list).
    - A public `/demo-help` page with copy buttons and image credits for every product photo (OD-7, OD-11).
    - The demo banner now links to Demo help.
    - Reusable `CardFields`, `RedeemGiftCardForm` and `DemoCardWarning` for the payment step (S15).
    - Account links to Orders and Saved Addresses go live in S16 and S13.
89. **Tests:** lint and typecheck pass; shared 26, backend 251 (+10: profile rules, credits, gift card redeem/replay/expiry, saved-card rules and no stored number/CVV, support and deletion, AUTHZ-002 for another account's card, demo help); frontend 19; E2E 189 passed / 16 viewport-skipped, including the S12 account flows, demo help and axe on every account page. Two flaky tests were fixed (a size-picker race and a long axe sweep on Firefox) and were stable over repeated runs. Account pages checked at 360 and 1280 px with no horizontal scroll.

## 2026-10-07 — Stage 13: Addresses and map (complete; map pending a Mapbox token)

90. **Backend:**
    - Migration M7: `Address` (one default per account via a partial unique index).
    - Address API: §12 validation plus the state reference list; serviceability and "Delivery by" from the pincode list; unserviceable addresses saved and flagged; 10-address limit; the first address becomes the default; set default; deleting the default promotes the most recent (EC-13); `NOT_FOUND` for other accounts' ids.
    - `GET /states` for the state picker.
91. **Frontend:**
    - `AddressDialog`: map step, then details step:
      - The map step (`AddressMapStep`, mapbox-gl and Mapbox Geocoding v6, loaded lazily) has place search, a draggable pin with reverse-geocode prefill, "Use my current location", and a 10 s load timeout. Any failure goes to the manual step with "Map unavailable — enter your address manually.", and "Enter address manually" is always visible (ADDR-003, INT-005).
      - The details step defaults the recipient to the profile, shows a static map preview when there are coordinates, and has Home/Work/Other labels.
    - Saved Addresses page (edit, set default, delete with confirmation, limit message). `AddressPicker` is reusable from the bag and checkout (ADDR-008).
    - **Deferred parts (PR-09) done:** the bag shows the customer's default or selected address with "Change" and "Delivery by" (BAG-010), and the PDP pincode defaults to the default address for customers (PDP-007).
    - **Mapbox token:** none is configured, so the app goes straight to manual entry. The live map path is built but **not yet verified against Mapbox**. Set `VITE_MAPBOX_TOKEN` in `frontend/.env.local` to enable and check it.
92. **Tests:** lint and typecheck pass; backend 258 (+7 addresses); frontend 19; E2E 198 passed / 16 viewport-skipped, including UF-14 with Mapbox blocked (manual entry, unserviceable address saved and flagged), default switching and deletion, bag delivery block and Change, PDP default pincode, and axe. The address dialog was checked at 360 and 1280 px.

## 2026-10-07 — Stage 14: Checkout (complete)

93. **Backend:**
    - Migration M8: `CheckoutSession` (source, lines, coupon, address, contact phone, step, pending changes, payment selection; kept on the server for CHK-007) and `Quote` (stored only for checkout and payment, PR-25).
    - `POST /checkout`:
      - bag or Buy Now source; the pending-order check (wired to orders in S15)
      - a flagged or empty bag → `CHECKOUT_BLOCKED`
      - re-validation diffs the quote the customer saw (last-seen prices, the bag's coupon) against a fresh one with the shared `quoteDiff`, so price changes, removed coupons (with reason), delivery and total changes are listed (EC-02, EC-03)
      - Buy Now checks stock and activity and ignores the bag coupon
      - the default serviceable address is preselected (falling back to the most recent serviceable one when the default isn't deliverable)
    - Further operations: acknowledge changes; phone (saved, or "this order only" when it belongs to another account, EC-14); address (own and serviceable only); coupon (bag rules, kept in step with the bag for bag checkouts); Buy Now quantity within stock; and step (needs a phone and an address to leave the Address step).
    - Every view stores a quote and returns its `quoteId` (API-006).
94. **Frontend:**
    - `/checkout` and `/checkout/buy-now?variant=` start a checkout and continue at `/checkout?c=<id>`.
    - Stepper; `ChangeSummary` with "Continue with these changes"; phone step; address step (unserviceable addresses shown but not selectable; add a new one inline); summary step (items, Buy Now quantity, coupon, address with Change); the price summary from the quote.
    - `PendingOrderDialog` (Retry / Cancel), wired to orders in S15.
    - Session expiry mid-checkout opens the login dialog and resumes on the same step (UF-15).
    - The payment step is a placeholder until S15.
95. **Bugs and flakiness fixed:**
    - New addresses at checkout now default the recipient phone to the number just entered (stale session data).
    - The login-timing test now compares lower quartiles over 16 samples, so CPU contention from parallel test files doesn't fail it. It was stable over 3 full runs.
96. **Tests:** lint and typecheck pass; backend 266 (+8 checkout: start and stored quote, EC-02, EC-03, CHECKOUT_BLOCKED, Buy Now with quantity and bag untouched, EC-14, address serviceability and step persistence with AUTHZ-002, coupon at checkout); frontend 19; E2E 212 passed / 16 viewport-skipped, including the bag → checkout flow, the unserviceable address (end of UF-14), Buy Now and UF-15.

## 2026-10-07 — Stage 15: Payment and order creation (complete)

97. **Backend:**
    - Migration M9: `Order`, `OrderLine`, `PaymentAttempt`, `PaymentAllocation` and `OrderStatusEvent`, with partial unique indexes for one Awaiting Payment order per account and one pending attempt per order.
    - `orders/core.ts`:
      - `writeTx` retries busy errors
      - `withOrder` takes the write lock first by bumping `version`, then re-reads (API-008)
      - order number (ORD-001)
      - state-machine transitions with events and actors
      - `placeOrder`: commit stock, capture the wallet, OTP, expected date, schedule fulfilment, remove the bought lines from a bag checkout
      - `releaseOrder` (release holds, reverse reservations)
    - **Pay** (`POST /checkout/:id/pay`, idempotent) runs in this order:
      1. pending-order guard
      2. instrument recognition: test cards, saved cards with an expiry check, UPI test IDs (`NOT_TEST_CARD`, `CARD_EXPIRED`)
      3. stock and activity check
      4. re-quote and diff against the shown `quoteId` → `QUOTE_CHANGED`; a removed coupon or unusable gift card leaves the selection (EC-07, EC-24)
      5. COD and method rules
      6. one transaction: order, conditional holds in variant order (`OUT_OF_STOCK` rolls everything back), line snapshots, conditional wallet reservations, and an attempt with its outcome decided up front (forced or weighted) and revealed 2–3 s later. r = 0 and COD are Placed at once.
    - **Payment selection** re-quotes on every change. A new card is identified by its first 8 digits (so the HDFC offer can be shown without sending the full number, SEC-003).
    - **Retry** (`/orders/:id/payment-quote`, `/orders/:id/retry-payment`): locked lines and coupon; the bank offer is recomputed for the new card; reservations are reversed and re-reserved; `PAYMENT_IN_PROGRESS`; `ORDER_NOT_PAYABLE` outside the window (PAY-015).
    - Cancel pending order (CNL-002) and attempt status.
    - Worker jobs: `resolvePaymentAttempts` (1 s; success places the order; the card is saved even after a failure, PAY-014) and `expirePayments` (5 s; skips orders with a processing attempt, EC-06). The worker process now runs a job registry.
    - Coupon use counts, credit and gift-card order links, and support-request order ownership now use real orders.
98. **Bug fixed — database lock errors under concurrency:**
    - **Cause:** the libSQL client hands its connection to each transaction and opens a fresh one afterwards, so the `busy_timeout` PRAGMA was lost. Concurrent writes from the API and the worker then failed immediately with SQLITE_BUSY, which the adapter reports as "Operation has timed out" (seen as random 500s in E2E).
    - **Fix:** the busy timeout is now passed as the client's `timeout` option, so it applies to every connection. `writeTx` also retries that error.
    - Simulator settings are now loaded before transactions, so nothing inside a transaction touches the shared client.
99. **Frontend:**
    - `PaymentForm`: demo warning; gift card select with inline redeem; credits switch; Card (saved cards with CVV, or a new card with "Save this card"; the bank offer previews from the card's first digits), UPI and COD (disabled above ₹10,000 with the message); the Pay label from the remainder; one idempotency key per action, reused only after a network failure; "Processing payment…" with 1 s polling; QUOTE_CHANGED change list with "Review and continue"; secrets cleared after errors.
    - Outcome panel with Retry and the minutes left. Retry page `/orders/:id/pay` with locked items. Confirmation page (PAY-013). The pending-order dialog is now live.
    - Playwright can show backend logs with `PW_SERVER_LOGS=1`.
100. **Tests:** lint and typecheck pass; shared 26, backend 279 (+13 payment: WX-1 to the paise through the API, QUOTE_CHANGED with nothing persisted, two customers on the last unit (INV-006, EC-04), duplicate idempotency key (EC-05), failure → card saved → UPI retry with the offer recomputed, the 15-minute expiry reversing stock/credits/gift card and running twice safely, EC-06, UF-06 wallet only, EC-08, COD and its limit, EC-07, EC-24, NOT_TEST_CARD and pending cancel, ownership); frontend 19; E2E 224 passed / 16 viewport-skipped, including UF-04, UF-05, UF-06 and COD. Payment and confirmation checked at 360 and 1280 px.

## 2026-10-07 — Stage 16: Fulfilment, orders UI, delivery OTP (complete)

101. **Backend:**
    - `orders/fulfilment.ts`:
      - `advanceOrders`: Placed → Confirmed → Packed → Shipped → Out for Delivery, one step per interval from the previous transition. A fictional courier and a `TRK…` tracking ID are assigned at Shipped. Out for Delivery starts the handover window and the attempt number; Delivery Attempt Failed → Out for Delivery for attempt 2 with the same OTP. Every step sets `hasUnseenUpdate`.
      - `expireHandovers` (DLV-006).
      - Delivery simulator confirm (correct OTP → Delivered, return windows for returnable lines, COD collected; wrong OTP → `OTP_INCORRECT`; the 5th → `OTP_LOCKED`, which ends the attempt, and on attempt 2 goes to Returned to Origin, EC-22).
      - Reject (Rejected at Delivery). Reject and Returned to Origin restock active lines (INV-004) and release uncollected COD.
      - Jobs are conditional on status and run twice safely; the worker runs them every 2 s.
    - Orders list (10 per page, headline, first item, +n more, total), `POST /orders/:id/seen`, and `hasUnseenOrderUpdates` in the session (PRF-007).
    - Order detail: tracking, OTP from Out for Delivery, simulator state, delivery progress.
    - **Left for Stage 17:** the whole-order refunds that Rejected at Delivery and Returned to Origin must create (RFD-003). The code marks where they go.
102. **Frontend:**
    - Orders list.
    - Order detail: headline badge, delivery progress plus a timestamped timeline, tracking, the OTP card ("Share this OTP…"), a visually distinct "Delivery simulator (demo)" panel (OTP confirm, tries, attempt 1 of 2, "Customer rejected parcel" with confirmation), items, address, payment breakdown with COD status, and the retry banner.
    - The page polls every 3 s while the order is moving, and opening it clears the unseen dot.
    - Header and account dots are live.
    - E2E runs with 2 s steps, an 8 s handover window and a 60 s retry window (`prepare-e2e-db`).
103. **Tests:** lint and typecheck pass; shared 26, backend 287 (+8 fulfilment with the fake clock across §7.1: step timing and run-twice safety, tracking and OTP visibility, Delivered with return windows and COD collected, the OTP lockout and attempt 2 with the same OTP, EC-22, UF-09, reject with restock, an OTP-vs-scheduler race applying exactly one transition (API-008), list pagination and ownership); frontend 19; E2E 236 passed / 16 viewport-skipped, including UF-07, UF-09, rejection, the unseen dots and axe on the orders pages. The order page was checked at 360 and 1280 px.

## 2026-10-07 — Stages 10–16 summary

104. **Done:** all seven stages, each tested, logged, committed and pushed.
    - **Open items for the owner:**
      - Mapbox token, to verify the live map step.
      - The WebKit E2E run, which is still pending since Stage 0.
    - **Next:** Stage 17 (refunds and cancellation), which also adds the whole-order refunds for rejected and returned-to-origin orders.

## 2026-10-07 — Mapbox token added; map step verified live

105. **The owner supplied a Mapbox public token.** It is stored in `frontend/.env.local`, which is gitignored and not committed. It was checked against the Mapbox Geocoding API.
106. **Bug found and fixed in the map step (S13):** the map rendered blank. Mapbox's stylesheet sets `position: relative` on the map container, which overrode its `absolute inset-0` layout. The container collapsed to zero height, so the canvas stayed hidden while tiles loaded. The container is now sized with width and height, and the map is resized once loaded (the dialog may still be animating).
107. **Verified live** (new `tests/e2e/map-live.spec.ts`, Chromium and mobile; skipped when no token is configured):
    - the map loads
    - place search → pin → reverse-geocode prefill of street, city, state and pincode
    - dragging the pin re-geocodes
    - the static map preview on the details step loads
    - saving keeps the coordinates
    - Edit reopens the map at the saved pin
    - "Use my current location" moves the pin
    - The existing tests still block Mapbox and confirm the manual fallback now runs through the real failure path.
108. **Tests:** E2E 238 passed / 16 skipped. One Stage 6 infinite-scroll test failed once on mobile under the full parallel load and passed 5/5 when repeated; it's noted as an occasional flake to look at in Stage 22.
