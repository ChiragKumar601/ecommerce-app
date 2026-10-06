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
