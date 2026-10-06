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
