# Implementation Plan — Fashion & Lifestyle Ecommerce (Customer Web App, V1)

> **Status:** v2.0. Revised after the architect review (PR-01 to PR-30) and the owner's decisions of 2026-10-06. **Awaiting owner approval.**
> **Inputs:** `intent.md` v2.1 (product source of truth) and `spec.md` v1.1 (functional source of truth). They win over this plan in any conflict.
> **This plan makes technical decisions only.** Product behaviour comes from the spec and is cited by requirement ID. §14 lists the implementation interpretations; none of them changes behaviour.
> **Local-first:** V1 is built and accepted on the local machine. Deployment is a separate later phase (Stage 23), started only with the owner's go-ahead.

---

## 1. Current repository state

| Item | Finding |
|---|---|
| Repository | `github.com/ChiragKumar601/ecommerce-app`, branch `main`, 1 commit (`176dfb1`, docs only) |
| Contents | `README.md`, `intent.md`, `spec.md`, `plan.md`. No application code yet. |
| Toolchain | Node 24.18, pnpm 10.33 (installed). **No database server needed**: SQLite comes with Prisma. |

## 2. Owner decisions applied in this revision

| # | Decision | Effect on the plan |
|---|---|---|
| OD-1 | **React Router** instead of Next.js routing | Frontend = Vite + React + React Router (data mode). No server rendering. Performance design in §8.4. |
| OD-2 | **Separate top-level `frontend/` and `backend/` folders**, each with its own run scripts | §4 layout, §5 scripts |
| OD-3 | **Express** for the backend | §7 |
| OD-4 | **Prisma + SQLite**, nothing to install | §6 data model, §6.3 concurrency, §7.4 search |
| OD-5 | **`shared/` holds only validation schemas and types that both sides genuinely use.** No business logic. | §4.3 |
| OD-6 | **Image reuse within a subcategory is allowed**, as long as the catalogue doesn't look obviously repetitive | S3.10 guardrails |
| OD-7 | **Image credit on `/demo-help`**; the footer doesn't change | S12.6 |
| OD-8 | Local first; deployment later | Stage 23 is a separate phase |

## 3. Tech stack

| Layer | Technology | Lives in | Purpose |
|---|---|---|---|
| Language / runtime | TypeScript 5, Node.js 24 | all | One language |
| Workspace | pnpm workspaces (`frontend`, `backend`, `shared`) | root | Install once; each folder runs on its own |
| **Frontend** | **Vite + React 19 + React Router 7 (data mode: `createBrowserRouter`, loaders, `lazy` routes)** | `frontend/` | SPA, routing, route-level code splitting |
| Styling | Tailwind CSS 4 | `frontend/` | Responsive, consistent styling |
| Accessible primitives | Radix UI (dialog, popover, navigation menu, slider, toast) | `frontend/` | Focus management, keyboard support (FE-004) |
| Server state | TanStack Query 5 | `frontend/` | Caching, infinite lists, optimistic updates, polling |
| Forms | react-hook-form + zod (schemas from `shared/`) | `frontend/` | AUTH-016, VAL-001 |
| Map | mapbox-gl (loaded lazily) + Mapbox Search/Geocoding | `frontend/` | ADDR-001 (needs a free token) |
| **Backend** | **Express 5** | `backend/` | REST API `/api/v1` |
| Backend middleware | helmet, cookie-parser, multer (review uploads) | `backend/` | Security headers, cookies, multipart |
| **ORM / DB** | **Prisma 6 + SQLite** (WAL mode) | `backend/` | Schema, migrations, typed queries; the database is a file |
| Background jobs | Node worker process (separate entry point in `backend/`) | `backend/` | Fulfilment simulator, payment resolution, daily jobs |
| Password hashing | Argon2id (`@node-rs/argon2`, prebuilt binary) | `backend/` | AUTH-007 |
| Images (uploads) | sharp (prebuilt binary) | `backend/` | Content-type sniffing, EXIF stripping (SEC-005) |
| PDF | pdf-lib + `@pdf-lib/fontkit` + Noto Sans font | `backend/` | Invoice PDF with ₹ (INV-I-003) |
| Product images | Pexels API (fetch script, run once) + Pexels CDN | `backend/` | D-22 (needs a free key) |
| Validation (shared) | zod | `shared/` | §12 schemas used on both sides |
| Tests | Vitest (backend, shared, frontend units) + React Testing Library; Playwright (E2E); @axe-core/playwright; Lighthouse CI | per folder | §11 |
| Quality | ESLint, Prettier, GitHub Actions CI | root | |

**Things only the owner can provide:**
- before Stage 3: a free **Pexels API key**
- before Stage 13: a free **Mapbox token**
- deployment accounts later (Stage 23 only)

Keys live in `backend/.env` and `frontend/.env.local`. Neither file is committed.

## 4. Repository layout

```
ecommerce-app/
├─ README.md · intent.md · spec.md · plan.md
├─ package.json            # root scripts only (§5); no runtime code
├─ pnpm-workspace.yaml     # packages: frontend, backend, shared
├─ tsconfig.base.json · eslint.config.js · .prettierrc · .editorconfig · .gitignore
├─ .github/workflows/ci.yml
│
├─ shared/                 # ONLY validation schemas + cross-boundary types (OD-5)
│  ├─ package.json         # name: @app/shared; deps: zod only
│  └─ src/
│     ├─ validation/       # §12 field rules + messages: name, email, phone, identifier, password,
│     │                    #   securityAnswer, address, pincode, card, upi, coupon, giftCard, otp,
│     │                    #   search, review, returnComment, supportMessage
│     ├─ types/            # API DTOs: Money {paise, display}, Quote, QuoteChange, ProductCard,
│     │                    #   Order views, ErrorCode union + error envelope (API-002), enums as unions
│     └─ index.ts
│
├─ backend/
│  ├─ package.json         # scripts: dev, dev:worker, build, start, start:worker, test, db:*, seed:*, …
│  ├─ .env.example         # DATABASE_URL=file:./data/app.db, PORT=4000, PEXELS_API_KEY, SESSION_SECRET, …
│  ├─ prisma/schema.prisma · prisma/migrations/*   (includes hand-written SQL for CHECKs/partial indexes)
│  ├─ seed-data/           # versioned JSON/MD sources (catalogue tree, templates, config, content, images manifest)
│  ├─ storage/uploads/     # review images (gitignored)
│  ├─ src/
│  │  ├─ server.ts         # Express bootstrap (API process)
│  │  ├─ worker.ts         # worker bootstrap (separate process)
│  │  ├─ config/           # env, settings cache (60 s), catalogue-version watcher
│  │  ├─ db/               # Prisma client, SQLite pragmas, tx helpers (write-first locking, busy retry)
│  │  ├─ domain/           # PURE rules: money, time, ids, random, clock, errors catalogue,
│  │  │                    #   pricing (quote, prorate), quote-diff, refunds (allocate), state machines,
│  │  │                    #   catalogue (discount, sortScore), search (tokenize, levenshtein)
│  │  ├─ services/         # transactional services: content, catalog, search-index, inventory, quote,
│  │  │                    #   bag, wishlist, auth, session, ratelimit, idempotency, profile, address,
│  │  │                    #   cards, wallet, checkout, payment(+simulator), orders, fulfilment, delivery,
│  │  │                    #   cancellation, returns, refunds, invoices, reviews, support, privacy, storage
│  │  ├─ api/
│  │  │  ├─ app.ts         # express app (used by server.ts and tests)
│  │  │  ├─ middleware/    # requestId, logging+redaction, session, originCheck, rateLimit,
│  │  │  │                 #   idempotency, validate(zod), requireAuth, errorHandler
│  │  │  └─ routes/        # nav, content, products, search, pincode, reviews, uploads, auth, me,
│  │  │                    #   addresses, cards, wallet, bag, wishlist, checkout, payments, orders,
│  │  │                    #   delivery-sim, invoices, support, demo-help
│  │  ├─ worker/jobs/      # resolvePaymentAttempts(1 s), advanceOrders, expirePayments, expireHandovers,
│  │  │                    #   advanceReturns, completeRefunds (5 s); resetDemoStock, purgeInactive,
│  │  │                    #   cleanup (daily, IST)
│  │  └─ scripts/          # fetch-images, generate-catalogue, seed, config-sync, verify-seed,
│  │                       #   coverage-report
│  └─ tests/               # unit (domain), integration (services + API via supertest), worker
│
└─ frontend/
   ├─ package.json         # scripts: dev, build, preview, test
   ├─ .env.example         # VITE_MAPBOX_TOKEN, VITE_API_BASE=/api/v1
   ├─ index.html · vite.config.ts (dev proxy /api → http://localhost:4000) · tailwind config
   ├─ src/
   │  ├─ main.tsx · router.tsx (route table, lazy routes, loaders, guards)
   │  ├─ routes/           # one folder per page: landing, section, category, all, best-sellers, offers,
   │  │                    #   search, product, bag, wishlist, auth/*, checkout/*, order-confirmation,
   │  │                    #   account/*, content-page, demo-help, not-found
   │  ├─ components/       # layout (DemoBanner, Header, MegaMenu, MobileDrawer, Footer), common
   │  │                    #   (AsyncState, ErrorMessage, ConfirmDialog, LoginPromptDialog, Toast…),
   │  │                    #   listing, product, bag, checkout, account, address, orders
   │  ├─ features/         # hooks: useSession, useBag, useWishlist, useQuote, useListing, useSearch…
   │  ├─ lib/              # api-client (envelope, idempotency keys, 401 handling), query-keys,
   │  │                    #   device-store, intent-resume, format (display only), seo (title/canonical)
   │  └─ styles/
   └─ tests/               # component tests; e2e/ (Playwright UF-01…UF-15)
```

### 4.3 Boundary rules (enforced by ESLint import rules)
- `frontend/` may import from `shared/` only, never from `backend/`.
- `backend/` may import from `shared/` only, never from `frontend/`.
- `shared/` imports nothing but zod. It contains **no** pricing, refund, state-machine or other business logic (OD-5).
- **Error messages** (§13) live in `backend/src/domain/errors.ts`. The API sends the catalogue text, and the frontend only displays it (GLB-003). The `ErrorCode` union type is in `shared/types` so the frontend can branch on codes.
- **Money formatting:** the API returns `{paise, display}` (API-005), so the frontend displays `display`. A display-only formatter in `frontend/src/lib/format.ts` exists only for client-generated labels, such as price-slider values. A test checks that it matches the backend's output on the same examples.

## 5. Run scripts (OD-2)

**Root `package.json`** (each script delegates to one folder):

| Script | Runs |
|---|---|
| `pnpm dev:frontend` | Vite dev server on `http://localhost:5173` (proxies `/api` to the backend) |
| `pnpm dev:backend` | Express API with watch mode on `http://localhost:4000` |
| `pnpm dev:worker` | Worker process with watch mode |
| `pnpm build:frontend` · `pnpm preview:frontend` | Production build and preview of the SPA |
| `pnpm build:backend` · `pnpm start:backend` · `pnpm start:worker` | Compiled backend API and worker |
| `pnpm test:frontend` · `pnpm test:backend` · `pnpm test:shared` | Unit and integration tests per folder |
| `pnpm test:e2e` | Playwright; starts the backend, worker and frontend itself |
| `pnpm db:migrate` · `pnpm db:reset` · `pnpm db:seed` | Backend database (SQLite file) |
| `pnpm config:sync` · `pnpm seed:verify` · `pnpm images:fetch` · `pnpm catalogue:generate` | Backend data scripts |
| `pnpm lint` · `pnpm typecheck` | All folders |

Each folder can also be run directly, for example `cd backend && pnpm dev`. A normal local session is three terminals: `dev:backend`, `dev:worker`, `dev:frontend`.

## 6. Database (Prisma + SQLite)

### 6.1 Conventions
- **File location:** `backend/data/app.db` for development and `backend/data/test-<worker>.db` for tests (one file per parallel test worker). Both are gitignored.
- **Connection pragmas**, set when the connection opens: `journal_mode=WAL` (the API and worker processes read and write concurrently), `busy_timeout=5000`, `foreign_keys=ON`, `synchronous=NORMAL`.
- **Money:** `Int`, in paise.
- **Timestamps:** Prisma `DateTime`, stored as UTC. IST is applied only in `domain/time.ts`.
- **Enums:** stored as `String` columns, typed with TypeScript unions in `shared/types` and checked by zod. This avoids relying on Prisma's SQLite enum support. Stage 0 confirms whether Prisma's `Json` type works on SQLite; if it doesn't, quote and snapshot payloads are stored as serialised `String`.
- **IDs:** random UUIDv4 strings for private resources (SEC-006). Products use a slug plus a 10-character random id.
- **Constraints Prisma's schema can't express** are added as hand-written SQL in the migration files (PR-23):

| Constraint | SQL | Spec |
|---|---|---|
| Stock never negative | `CHECK (held >= 0 AND held <= on_hand)` on `inventory` | INV-006 |
| Price sanity | `CHECK (selling_price <= mrp AND selling_price > 0)` on `variant` | §4.1 |
| One identifier present | `CHECK (email IS NOT NULL OR phone IS NOT NULL)` on `account` | §4.3 |
| Unique email and phone | partial unique indexes `WHERE email IS NOT NULL` / `WHERE phone IS NOT NULL` | R-08 |
| **One Awaiting Payment order per account** | `CREATE UNIQUE INDEX … ON "order"(account_id) WHERE status='AWAITING_PAYMENT'` | R-09 |
| One pending payment attempt per order | partial unique index `WHERE outcome='pending'` | PAY-011 |
| One default address and one default card | partial unique index `WHERE is_default = 1` | ADDR-006, PRF-005 |
| One review per account and product | partial unique index `WHERE author_account_id IS NOT NULL` | REV-006 |

  An integration test (S3.2) attempts each violation and expects the database to reject it.

### 6.2 Tables by migration (aligned with §10 stages — PR-08)

| Migration | Stage | Tables |
|---|---|---|
| **M1 config, content, reference** | S3 | `setting` (key, value, includes `catalogue_version`), `hero_slide`, `shop_by_category_card`, `popular_search`, `content_page`, `faq_entry`, `security_question`, `state_ref`, `serviceable_pincode`, `delivery_zone`, `tax_rate`, `return_policy_node`, `coupon`, `bank_offer`, `test_card`, `test_upi`, `gift_card_code`, `blocked_word` |
| **M2 catalogue** | S3 | `catalogue_node`, `brand`, `product`, `product_node`, `variant`, `inventory`, `product_image` (source, photographer, licence, url), `size_guide`, `product_curated_rec` |
| **M3 reviews (read)** | S3 | `review`, `review_image`, `review_report`, `rating_aggregate` (**a cached, derived table**, see below) |
| **M4 accounts** | S10 | `account` (incl. `last_activity_at`), `session`, `recent_search`, `rate_limit_bucket`, `idempotency_key`, `credit_ledger_entry` |
| **M5 bag & wishlist** | S11 | `bag`, `bag_line`, `wishlist_entry` |
| **M6 profile & wallet** | S12 | `saved_card`, `account_gift_card`, `gift_card_txn`, `support_request` |
| **M7 addresses** | S13 | `address` |
| **M8 checkout & quotes** | S14 | `checkout_session`, `quote` (**stored only for checkout and payment** — PR-25) |
| **M9 orders & payment** | S15 | `order`, `order_line`, `payment_attempt`, `payment_allocation`, `order_status_event` |
| **M10 refunds & cancellation** | S17 | `refund`, `refund_allocation` |
| **M11 returns** | S18 | `return_request` |
| **M12 invoices** | S19 | `invoice` |

**Derived data (PR-29):**
- `rating_aggregate` is a **cache** derived from visible reviews. It is never edited directly. It is recalculated in the same transaction as every review create, edit, delete or hide, and seed/verify recomputes it and checks for equality (DAT-003, REV-011).
- `available` is always calculated as `on_hand − held`.
- A product's `returnable` flag is derived from `return_policy_node`. It is set at seed time and re-derived on `config:sync`.

**Lifecycle:**
- Privacy purge (PRV-001…003): reviews are anonymised first, then an explicit ordered delete removes the account's rows.
- Demo stock reset (INV-005).
- Cleanup of expired `quote`, `idempotency_key` (24 h) and `rate_limit_bucket` rows.

### 6.3 Concurrency on SQLite (replaces Postgres row locks — PR-05)

SQLite allows **one writer at a time** across all processes. The plan relies on that instead of row locks:

| Need | Approach | Spec |
|---|---|---|
| Serialise actions on one order (customer versus worker) | Every write transaction **starts by writing**: it touches the order (`UPDATE "order" SET version = version + 1 WHERE id = ?`). That takes the write lock immediately. It then re-reads the state and checks the transition with the domain state machine. A stale state → `ACTION_NOT_ALLOWED`. | API-008, EC-12 |
| Last unit sold twice | A conditional hold: `UPDATE inventory SET held = held + ? WHERE variant_id = ? AND on_hand - held >= ?`. Zero rows changed → `OUT_OF_STOCK`. | INV-001, INV-006 |
| One pending order | The partial unique index, plus a check at the start of Pay | R-09 |
| Lock contention | `busy_timeout` of 5 s, plus a helper that retries `SQLITE_BUSY` up to 3 times with jitter. Transactions are kept short: no external calls inside them. | — |
| Worker safety on re-runs | Each job selects due rows, then applies every transition as a conditional update (`WHERE status = <expected>`). Running a job twice is harmless. | API-007 |

## 7. Backend (Express) design

### 7.1 Request pipeline (`backend/src/api/app.ts`)
1. `helmet` (security headers) and `requestId`
2. structured logging with a **redaction list** (password, answer, card number, CVV, OTP, cookie, token)
3. `express.json` with a size limit; `cookie-parser`
4. **session**: loads the session from its cookie, applies idle (60 min) and absolute (24 h) expiry, and throttles `last_activity_at` writes to once a minute (AUTH-011, PRV-001)
5. **originCheck**: rejects any non-GET request whose `Origin` doesn't match the configured frontend origin (CSRF; SEC-001). The session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in production only (PR-24, PR-26).
6. per-route **rateLimit** (SEC-004), **validate** (shared zod schema), **requireAuth** where needed (API-001), **idempotency** (API-003)
7. route handler → service
8. **errorHandler**: `AppError` → HTTP status plus the §13 envelope (API-002). Unknown errors → 500 with the generic message. Stack traces are never sent.

**CORS** isn't enabled: in development the Vite proxy makes everything one origin (PR-07), and in production a reverse proxy will do the same (Stage 23).

### 7.2 Endpoints (`/api/v1`) — spec §11.2

| Router | Endpoints | Spec operations |
|---|---|---|
| nav, content | `GET /nav` · `GET /content/landing` · `GET /content/pages/:slug` · `GET /faqs` · `GET /demo-help` | GetNavigationTree, GetLandingContent, GetPage, ListFaqs |
| products | `GET /products?scope&node&q&filters&sort&cursor` · `GET /products/:id` · `GET /products/:id/recommendations` · `GET /pincode/:pin` | ListProducts, GetProduct, GetRecommendations, CheckPincode |
| search | `GET /search/suggest?q` · `GET /search/recent` · `DELETE /search/recent` | GetSuggestions, Get/ClearRecentSearches |
| reviews | `GET /products/:id/reviews` · `POST /reviews` · `PATCH /reviews/:id` · `DELETE /reviews/:id` · `POST /reviews/:id/report` · `POST /uploads/review-images` | Reviews |
| auth | `POST /auth/signup` · `POST /auth/login` · `POST /auth/logout` · `POST /auth/reset` · `GET /auth/session` | Auth |
| me | `GET /me` · `PATCH /me` · `GET/POST /me/addresses` · `PATCH/DELETE /me/addresses/:id` · `POST /me/addresses/:id/default` · `GET/POST /me/cards` · `DELETE /me/cards/:id` · `POST /me/cards/:id/default` · `GET /me/credits` · `GET /me/gift-cards` · `POST /me/gift-cards/redeem` · `GET/POST /me/support-requests` | Profile, Addresses, Cards, Wallet, Support |
| bag | `POST /bag/guest-quote` (guest lines in the body; **not stored**) · `GET /bag` · `POST /bag/lines` · `PATCH /bag/lines/:variantId` · `DELETE /bag/lines/:variantId` · `POST /bag/lines/:variantId/move-to-wishlist` · `POST /bag/coupon` · `DELETE /bag/coupon` · `GET /coupons/available` | Bag |
| wishlist | `GET /wishlist` · `POST /wishlist` · `DELETE /wishlist/:productId` · `POST /wishlist/:productId/move-to-bag` · `POST /wishlist/guest-view` (guest product ids → card data) | Wishlist |
| checkout | `POST /checkout` · `GET /checkout/:id` · `POST /checkout/:id/phone` · `PUT /checkout/:id/address` · `PUT /checkout/:id/coupon` · `PUT /checkout/:id/items` (Buy Now qty) · `PUT /checkout/:id/payment-selection` | StartCheckout, SetPhone, SelectAddress, ApplyCoupon, SetPaymentSelection |
| payments | `POST /checkout/:id/pay` · `GET /payment-attempts/:id` · `POST /orders/:id/retry-payment` | Pay, RetryPayment |
| orders | `GET /orders` · `GET /orders/:id` · `POST /orders/:id/cancel` · `POST /orders/:id/lines/:lineId/cancel` · `GET /orders/:id/refund-preview` · `POST /orders/:id/lines/:lineId/returns` · `POST /orders/:id/seen` | Orders |
| delivery-sim | `POST /orders/:id/delivery-sim/confirm` · `POST /orders/:id/delivery-sim/reject` | Simulator |
| invoices | `GET /orders/:id/invoice` · `GET /orders/:id/invoice.pdf` | GetInvoice |

**Rules:**
- Every account-scoped query filters by the session's `accountId`. A missing row and someone else's row both return `NOT_FOUND` (AUTHZ-001/002).
- **Guest quotes are computed but not stored.** Only checkout and payment quotes are stored with a `quoteId`, because API-006 only needs one where Pay follows (PR-25).
- Responses always carry money as `{paise, display}` (API-005).

### 7.3 Pure domain modules (`backend/src/domain`)

| Module | Content | Spec |
|---|---|---|
| `money.ts` | paise arithmetic, half-up rounding to the rupee, largest-remainder split, Indian-grouped ₹ display | §0, SD-01, SD-43 |
| `time.ts`, `clock.ts`, `random.ts`, `ids.ts` | IST calendar dates; an injectable clock and a seeded random generator for tests; UUIDs | §0, SEC-006 |
| `errors.ts` | §13.1 code → HTTP status and customer message; `AppError` | GLB-003, §13 |
| `pricing/quote.ts`, `pricing/prorate.ts` | PRC-001…012, in the exact order PRC-001 → 012 | §6.13 |
| `pricing/quoteDiff.ts` | **One change-list format** (PR-18): `ITEM_REMOVED`, `QTY_REDUCED`, `PRICE_CHANGED`, `COUPON_REMOVED`, `DELIVERY_CHANGED`, `GIFT_CARD_UNUSABLE`, `BANK_OFFER_CHANGED`, `TOTAL_CHANGED`. Used by CHK-002 and `QUOTE_CHANGED`. | CHK-002, PAY-006, BAG-007 |
| `refunds/allocate.ts` | RFD-001…004, 007 | §6.20 |
| `state/*.ts` | declarative transition tables for §7.1–7.8 | §7 |
| `catalogue/discount.ts`, `catalogue/sortScore.ts` | SD-05, PLP-003 | |
| `search/tokenize.ts`, `search/levenshtein.ts` | normalisation, bounded edit distance | SRC-004 |

### 7.4 Search on SQLite (replaces `pg_trgm` — PR-05, PR-22)
- **The in-memory index** (`services/search-index`) is built in the API process at start-up, from products, brands, catalogue nodes, colours and specification values (SRC-003). It holds:
  - an inverted index (word → product ids, with field weights)
  - a vocabulary bucketed by word length
- **Typo matching:** each query word is matched exactly first. Fuzzy candidates come from vocabulary words whose length is within ±1 (query word ≤ 5 characters) or ±2 (longer). They are kept only if the bounded Levenshtein distance is ≤ 1 or ≤ 2 respectively. Exact matches rank above fuzzy ones (SRC-004).
- **Filters, facets and sorts** for search results reuse the listing service, with the matched product ids as the scope (SRC-006).
- **Freshness:** `config:sync` and seeding increment `setting.catalogue_version`. The API checks it every 60 s and rebuilds the index when it changes (PR-22).
- **Performance gate:** p95 under 50 ms for the index lookup, and under 200 ms end to end for suggestions.

### 7.5 Key transactional services (all writes follow §6.3)

| Service | Steps |
|---|---|
| `payment.pay` (PAY-006…008) | 1. Idempotency check.<br>2. Assert no Awaiting Payment order exists.<br>3. Re-quote and diff against the shown `quoteId` → `QUOTE_CHANGED`.<br>4. Place stock holds, in variant-id order → `OUT_OF_STOCK`.<br>5. Insert the order, lines, address snapshot (ADDR-007), contact phone and order number (ORD-001).<br>6. Wallet debits plus `reserved` allocations.<br>7. Payment attempt: decide its outcome now (forced test value, or weighted random) and set `resolveAt` to now + 2–3 s.<br>8. If r = 0, or the method is COD → Placed immediately: commit stock, capture, generate the OTP. |
| worker `resolvePaymentAttempts` (**1 s tick** — PR-12) | Apply the outcome of each attempt whose `resolveAt` has passed. Revealing at 2–3 s on a 1 s tick lands within 2–4 s (PAY-008). Success → Placed, commit, capture, OTP, remove bag lines (bag source only). |
| `payment.retry` | Awaiting Payment, inside the window and with no pending attempt. Re-quote on the locked lines; re-reserve the wallet; new attempt. |
| worker `expirePayments` | Window over **and** no pending attempt → Failed; release holds; reverse the wallet (PAY-012, EC-06). |
| worker `advanceOrders` / `expireHandovers` | Rows with `next_transition_at` due → the next timer transition (ORD-004, DLV-006). |
| `delivery.confirm` / `delivery.reject` | DLV-003…005 |
| `cancellation.*` | CNL-001…004 |
| `returns.*` + worker `advanceReturns` | RET-001…007 |
| `refunds.*` + worker `completeRefunds` | RFD-001…007 |
| `bag.merge` | AUTH-012, including recent searches (PR-11) |
| `reviews.*` | REV-003…012; the aggregate is recalculated in the same transaction |
| `privacy.purge` | PRV-001…003 |

## 8. Frontend (Vite + React + React Router) design

### 8.1 Routing (`frontend/src/router.tsx`)
- `createBrowserRouter` in **data mode**. Each route has a `lazy()` import, so its code loads only when needed, and a `loader` that starts fetching data through TanStack Query (`queryClient.ensureQueryData`) in parallel with the code download. This avoids request waterfalls (PR-06).
- **The route table follows spec §10.1.** Static routes are declared before the dynamic `/:section/:category/:sub?` route, and the reserved segments of SD-64 can never match it.
- **Guards:** protected routes (`/account/*`, `/checkout/*`, `/orders/:id/pay`, `/order-confirmation/:id`) use a loader that checks `GET /auth/session`. Without a session, it redirects to `/login?returnTo=…` (AUTH-015).
- **Unknown routes and unknown or inactive slugs** go to the `not-found` route (GLB-005). A loader that receives `NOT_FOUND` throws a 404 response, which the error element renders.
- **Page titles and canonical link:** each route's `handle` builds a title and canonical path from its loader data, and a `<Seo>` component in the layout applies them (FE-007).

### 8.2 State management
| State | Mechanism | Spec |
|---|---|---|
| Server data | TanStack Query, with key factories in `lib/query-keys.ts` | — |
| Listing state | URL search params (filters, sort). Pages come from `useInfiniteQuery`, keyed by the URL. | PLP-008 |
| **Scroll restore with infinite scroll** (PR-17) | Loaded pages stay in the Query cache (5 min). On Back, the listing re-renders the cached pages, then restores the saved `scrollY`, which is kept in sessionStorage per URL key. React Router's `<ScrollRestoration>` is disabled for listing routes. | PLP-008 |
| Filter persistence within a section | sessionStorage per section. Applied on navigation, then pruned to the facets the new listing actually has. | PLP-009 |
| Session | `useSession()` Query. On any 401 `SESSION_EXPIRED`, the api-client opens the login dialog, waits for login, and **re-sends the original request with the same idempotency key** (PR-21). | AUTH-011 |
| Guest device data | `lib/device-store.ts`: localStorage with `lastUpdatedAt`, a 30-day expiry, and an in-memory fallback with a warning | FE-003, EC-18 |
| Bag and wishlist | `useBag()` and `useWishlist()`: one interface over the device store (guest) or the API (customer). Header badge = total units. | NAV-004, D-30 |
| Interrupted actions | `lib/intent-resume.ts` stores `{action, payload, returnTo}` in sessionStorage before the login prompt, and replays it after login or sign-up | AUTH-020, R-22 |
| Idempotency keys | The api-client creates one key per user action and keeps it until the action succeeds or fails permanently | API-003, PR-21 |
| Quote | Always fetched from the server. Every payment-selection change triggers a new quote. | INT-001, PAY-002 |
| Checkout | Stored on the server (`checkout_session`) | CHK-007 |
| Payment processing | Poll `GET /payment-attempts/:id` every 1 s until the outcome is final | PAY-008 |
| Unseen order updates | A flag in the session payload, refetched when the window regains focus | PRF-007 |

### 8.3 Component inventory
- **Layout:** `DemoBanner`, `Header`, `MegaMenu`, `MobileDrawer`, `SearchBar`, `SearchOverlay`, `IconNav`, `Footer`, `Seo`.
- **Common:** `AsyncState`, `ErrorMessage`, `ConfirmDialog`, `LoginPromptDialog`, `Toast` (with Undo), `Price`, `RatingBadge`, `ProductCard`, `Chip`, `QuantitySelect`.
- **Listing:** `FilterSidebar`, `FilterSheet`, `SortSheet`, `InfiniteGrid`.
- **PDP:** `Gallery`, `Lightbox`, `SizeSelector`, `OffersBlock`, `PincodeCheck`, `SizeGuideDialog`, `RecommendationRail`, `ReviewSection`, `ReviewForm`.
- **Address:** `AddressMapStep` (lazy Mapbox, 10 s timeout), `AddressDetailsForm`.
- **Checkout:** `Stepper`, `ChangeSummary`, `PhoneStep`, `PaymentSelector`, `PendingOrderDialog`.
- **Orders:** `OrderTimeline`, `DeliverySimulatorPanel`, `RefundList`, `CancelDialog`, `ReturnFlow`, `InvoiceView`.

### 8.4 Performance design for an SPA (FE-006 — PR-06)
| Measure | Target or detail |
|---|---|
| Initial JavaScript budget | ≤ 170 KB gzip for the landing route (React, router and the layout only). Every page, Radix component and mapbox-gl is split into its own chunk. Budgets are enforced in the build. |
| Data in parallel with code | Route loaders start fetches before the page's component code arrives |
| LCP image | The first hero slide and the first product images use `fetchpriority="high"`, explicit width and height, and a `srcset` built from Pexels size parameters (`?w=`). Images below the fold use `loading="lazy"`. |
| Layout stability | Fixed aspect-ratio boxes (3:4 cards, hero ratio); skeletons the same size as the content |
| Fonts | System font stack. No web font on the critical path. |
| Caching | Immutable hashed assets. Catalogue reads are cached in Query, and the API sets short `Cache-Control` headers on public catalogue endpoints. |
| Verification | Lighthouse CI (mobile, simulated 4G) on landing, PLP, PDP and bag, run against `pnpm preview:frontend` with the production backend build. The budgets are a stage gate. |

## 9. Implementation stages

**Rules for every stage:**
- Each step is one focused commit. **[B]** = backend, **[F]** = frontend, **[S]** = shared.
- A stage is done when its tests pass and `lint` and `typecheck` are clean.
- It ends with a summary (what changed, which requirements are covered, what remains) and a push of the stage branch `stage/NN-name`. The owner merges it.

**Dependency chain:**
S0 → S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8 → S9 → S10 → S11 → S12 → S13 → S14 → S15 → S16 → {S17 → S18} · S19 · S20 → S21 → S22.

### Stage 0 — Foundation
| Step | Work | Done when |
|---|---|---|
| S0.1 | Root workspace: `pnpm-workspace.yaml`, root `package.json` with the §5 scripts, `tsconfig.base`, ESLint with **import-boundary rules** (§4.3), Prettier, `.editorconfig`, `.gitignore` | `pnpm lint`, `pnpm typecheck` |
| S0.2 | `shared/` package (zod only) with an empty export and a test | `pnpm test:shared` |
| S0.3 | `backend/` skeleton: Express app with `GET /api/v1/health`, `server.ts`, `worker.ts` (logs a tick), Vitest + supertest, `.env.example` | `pnpm dev:backend` answers on :4000; `pnpm dev:worker` ticks; `pnpm test:backend` |
| S0.4 | Prisma + SQLite: schema skeleton, pragmas (§6.1), a migration pipeline that supports hand-written SQL, a per-test database helper. **Check Prisma's `Json` support on SQLite** and record the result. | `pnpm db:migrate` creates `backend/data/app.db`; a test DB is created per test file |
| S0.5 | `frontend/` skeleton: Vite + React + React Router (data mode), Tailwind, TanStack Query provider, the `/api` dev proxy, and a page that calls `/api/v1/health` | `pnpm dev:frontend` shows the health status from the backend |
| S0.6 | Playwright config: `webServer` starts the backend, worker and `preview:frontend`; Chromium, Firefox, WebKit plus a 390 px viewport; one smoke test | `pnpm test:e2e` |
| S0.7 | GitHub Actions: lint, typecheck, test:shared, test:backend, test:frontend, and e2e (smoke) | CI green |

### Stage 1 — Shared schemas and backend domain kernel
| Step | Work | Requirements |
|---|---|---|
| S1.1 [S] | `shared/validation`: every §12 rule with its exact message (name … support message), the identifier detector (email vs phone), phone normalisation to `+91…` | §12, VAL-001, AUTH-004 |
| S1.2 [S] | `shared/types`: `Money`, `ErrorCode` union, error envelope, `QuoteChange` union, enum unions | API-002, API-005 |
| S1.3 [B] | `domain/money.ts`, `time.ts`, `clock.ts`, `random.ts`, `ids.ts` | §0, SD-01, SD-02, SEC-006, FE-008 |
| S1.4 [B] | `domain/errors.ts`: every §13.1 code → status and message; `AppError` | GLB-003, §13 |
| **Verify** | Unit tests for every validation rule and message; money cases (₹1,23,456 · ₹850.11 · ₹0 · rounding · largest remainder); IST date boundaries | |

### Stage 2 — Pure business engines (backend/domain)
| Step | Work | Requirements |
|---|---|---|
| S2.1 | `pricing/prorate.ts` | PRC-004, SD-43 |
| S2.2 | `pricing/quote.ts`: line values, coupon, delivery | PRC-001…005 |
| S2.3 | `pricing/quote.ts`: bank offer, total, wallet, offer withdrawn when the wallet covers everything, tax portion, COD rule, quote shape | PRC-006…012, SD-44 |
| S2.4 | `pricing/quoteDiff.ts` (the shared change-list format, PR-18) | CHK-002, PAY-006, BAG-007 |
| S2.5 | `refunds/allocate.ts` | RFD-001…004, RFD-007 |
| S2.6 | `state/*`: order, order line, return request, payment attempt, refund, gift card, review, lock | §7.1–7.8 |
| S2.7 | `catalogue/discount.ts`, `catalogue/sortScore.ts`, `search/tokenize.ts`, `search/levenshtein.ts` | SD-05, PLP-003, SRC-004 |
| **Verify** | **WX-1…WX-4 exact paise**; EC-08…EC-11; ₹1,999.00 vs ₹1,999.01; minimum-value boundaries for coupons and the bank offer; property test that shares sum exactly; exhaustive transition tests; Levenshtein bounds | |

### Stage 3 — Data: schema, reference/config, catalogue seed (Pexels key before S3.7)
| Step | Work | Requirements |
|---|---|---|
| S3.1 [B] | Migrations M1, M2, M3 | §4.1, §4.2, §4.6, §4.8 |
| S3.2 [B] | Hand-written constraints SQL (§6.1) + tests that each violation is rejected | INV-006, R-08, R-09 (index), PR-23 |
| S3.3 [B] | `seed-data/catalogue/tree.json` from intent §6.1 and the README lists, with the T-6 changes. Validator: maximum 3 levels, unique slugs among siblings, reserved segments. | DAT-001, SD-64, NAV-007 |
| S3.4 [B] | **Commercial config**: `settings` (§5), coupons, the bank offer, tax rates, return policy, delivery zones | §5, DAT-005, R-17, R-25 |
| S3.5 [B] | **Reference data**: states and UTs; **≥ 200 serviceable pincodes taken from the India Post pincode directory on data.gov.in** (Government Open Data Licence – India; the source is recorded), at least one major city per state, assigned to zones; ≥ 6 security questions; blocked words | DAT-005, DAT-009, PR-13 |
| S3.6 [B] | **Demo and test data**: test cards (Luhn-valid; HDFC credit / HDFC debit / non-HDFC × random, success, failure, cancelled, timed out), test UPI IDs, ≥ 5 gift card codes (one with a short validity) | DAT-006, DAT-007 |
| S3.7 [B] | `scripts/fetch-images.ts`: queries Pexels per subcategory (falling back to the parent category), writes `seed-data/images/manifest.json` with URL, photographer, Pexels page URL and licence | D-22 |
| S3.8 [B] | Generator, part 1: brand pool (fictional), per-subcategory templates (name parts, subtitles, size systems, price bands, specification templates, gender, colours) | DAT-002, D-28, SD-04 |
| S3.9 [B] | Generator, part 2: products and variants, at **≥ 6 per subcategory, ≥ 48 per category, about 1,800–2,500 in total**; flags (bestSeller, bankOfferEligible, inclusiveSizing); listing dates; stock including deliberate out-of-stock variants | DAT-002, D-44, T-44, R-33 |
| S3.10 [B] | Generator, part 3: **image assignment with repetition guardrails (OD-6)**: 2–4 images per product; a primary image is shared by at most 2 products in a subcategory; products sharing a primary image never sit next to each other in the default (Recommended) order; and they differ in colour, name and gallery order. Plus curated recommendations (bought together, complete the look). | D-22, OD-6, PDP-011 |
| S3.11 [B] | Seeded reviews that produce exactly each product's rating; `rating_aggregate` recalculated from them | DAT-003, R-20, SD-06 |
| S3.12 [B] | Content data: hero slides (≥ 5, one linking to Best Seller Styles), Shop by Category cards (intent §6.2, with T-6 merges), popular searches, footer content, placeholder pages (including the Privacy page with PRV-004 text), ≥ 15 FAQs across 5 topics | DAT-004, DAT-008, LND-003, PRV-004 |
| S3.13 [B] | `seed.ts`, `config-sync.ts` (idempotent upsert, increments `catalogue_version`), `verify-seed.ts` (volumes, licences, aggregates, every node non-empty, the repetition guardrails, price and slug rules) | I §7.9, DAT-*, PR-22 |
| **Verify** | `pnpm seed:verify` passes. **Manual spot-check of about 50 random products** (names, prices, images look right and aren't obviously repetitive), recorded in the stage summary (PR-14). | |

### Stage 4 — Platform layers (backend API + frontend app shell)
| Step | Work | Requirements |
|---|---|---|
| S4.1 [B] | Middleware: requestId, logging with redaction, json limit, cookie-parser, helmet, errorHandler (envelope), validate(zod) | API-002, GLB-003, SEC-002, SEC-003 |
| S4.2 [B] | `originCheck` (CSRF), the rate-limit store (SQLite fixed window), the settings cache and the catalogue-version watcher | SEC-001, SEC-004, I §7.9 |
| S4.3 [F] | App shell: layout, `DemoBanner`, Tailwind tokens (AA contrast), `Seo`, the error element and `not-found` | GLB-001, GLB-005, FE-001, FE-007 |
| S4.4 [F] | `api-client` (envelope parsing, idempotency key per action, 401 handling hook), query keys, `AsyncState`, `ErrorMessage`, `Toast`, `ConfirmDialog` | GLB-002…004, ERR-001…003, API-003, FE-002 (the client displays server-computed values only; optimistic UI is limited to the wishlist toggle and bag quantity) |
| **Verify** | supertest: error envelope, rejected bad Origin, rate-limit 429; Playwright: banner at 4 widths, no horizontal scroll | |

### Stage 5 — Navigation, footer, content pages
| Step | Work | Requirements |
|---|---|---|
| S5.1 [B] | `GET /nav`, `GET /content/pages/:slug`, `GET /faqs` (cached) | NAV-007 |
| S5.2 [F] | `Header`: logo, the six sections, icons with labels, badge placeholder | NAV-001…004 |
| S5.3 [F] | `MegaMenu` (hover and focus, 150 ms grace, Escape) and `MobileDrawer` (focus trap and return) | NAV-005, NAV-006 |
| S5.4 [F] | `Footer` in the LND-007 order (no image credit there — OD-7); content page route with a placeholder label | LND-007, LND-008 |
| **Verify** | Keyboard E2E for the menu and drawer; axe; adding a node in data shows it after `config:sync` without a code change | |

### Stage 6 — Listings (before the landing page — PR-10)
| Step | Work | Requirements |
|---|---|---|
| S6.1 [B] | `listProducts`: scopes (section, category, subcategory, all, bank-offer, best-seller) + cursor pages of 24 + `totalCount` | PLP-001, PLP-005, PLP-007, PLP-015, API-004 |
| S6.2 [B] | Filters: gender, category, brand, price, colour, discount buckets, size (available), rating, in-stock | PLP-002, SD-30 |
| S6.3 [B] | Facet counts per filter within the scope; facets with no values hidden | PLP-002 |
| S6.4 [B] | Sorts (Recommended score, What's New, price ↑↓, discount, rating), with out-of-stock always last; card data (lowest available variant price, badge, out-of-stock flag) | PLP-003, PLP-004, PLP-012, PLP-013, SD-31, SD-32 |
| S6.5 [F] | Routes: `/shop/:section`, `/shop/all`, `/:section/:category/:sub?`, `/collections/best-seller-styles`, `/offers/hdfc`; unknown slugs → not found | NAV-009, GLB-005 |
| S6.6 [F] | `ProductCard`, `FilterSidebar` (≥ 1024 px), `FilterSheet` and `SortSheet` (< 1024 px), chips, scope-preserving Clear all, count | PLP-005, PLP-006, PLP-010, PLP-011 |
| S6.7 [F] | URL state, `InfiniteGrid` (24 per page, "Load more" fallback, end message), cached-page scroll restore (PR-17) | PLP-007, PLP-008 |
| S6.8 [F] | Filter persistence within a section | PLP-009 |
| S6.9 [F] | Card wishlist toggle on the **device store** (the server version comes in S11) | PLP-014 (guest) |
| **Verify** | Integration tests for every filter, facet and sort against fixtures; E2E to the PDP link; listing API p95 < 200 ms locally; Lighthouse on PLP | |

### Stage 7 — Landing page
| Step | Work | Requirements |
|---|---|---|
| S7.1 [B] | `GET /content/landing` (slides, bank offer, cards) | LND-001 |
| S7.2 [F] | Accessible carousel (autoplay 5 s; pause on hover, focus and button; Previous, Next, Pause/Play; at most 8 slides; LCP priority on the first image) | LND-002, LND-003, R-38, FE-006 |
| S7.3 [F] | Bank-offer tile + T&C dialog → `/offers/hdfc` (already built in S6) | LND-004 |
| S7.4 [F] | Shop by Category grid (3:4 crop, 6/5/4/2 columns, data-driven) | LND-005, LND-006 |
| **Verify** | E2E; a card added in data appears after sync; Lighthouse on `/` within budget | |

### Stage 8 — Search
| Step | Work | Requirements |
|---|---|---|
| S8.1 [B] | `search-index` service (build, version-based rebuild) | SRC-003, PR-22 |
| S8.2 [B] | Query matching with typo tolerance and ranking; the search scope in `listProducts` | SRC-004, SRC-006, SRC-008, SRC-010 |
| S8.3 [B] | `GET /search/suggest` (grouped, at most 8) | SRC-001, SRC-005 |
| S8.4 [F] | `SearchBar` (desktop), `SearchOverlay` (mobile), 250 ms debounce, empty-focus view, recent searches on the device, the results route and zero-results page | NAV-008, SRC-002, SRC-007, SRC-009 (guest) |
| **Verify** | A ≥ 30-case typo test set ("snaekers" → sneakers …); exact matches ranked first; latency gates (§7.4); E2E UF-02 | |

### Stage 9 — Product detail page (read side)
| Step | Work | Requirements |
|---|---|---|
| S9.1 [B] | `GET /products/:id`: variants with availability, offers block, return eligibility, inactive handling, breadcrumb hint | PDP-002, PDP-003, PDP-005, PDP-006, PDP-013, NAV-010 |
| S9.2 [B] | `GET /pincode/:pin`, `GET /products/:id/recommendations`, `GET /products/:id/reviews` (sort, filter, pages) | PDP-007, PDP-011, REV-001, REV-002, T-17, SD-33, SD-34 |
| S9.3 [F] | `Gallery` + `Lightbox` (zoom, swipe, arrow keys, Escape), `SizeSelector`, "More colours" swatches, `SizeGuideDialog` | PDP-001, PDP-003, PDP-006 |
| S9.4 [F] | `OffersBlock`, info sections, `PincodeCheck` (the guest pincode remembered on the device), breadcrumbs | PDP-005, PDP-006, PDP-007 (guest), NAV-010 |
| S9.5 [F] | Recommendation rails, `ReviewSection` (read only) | PDP-011, REV-001, REV-002 |
| **Verify** | E2E; axe; Lighthouse on the PDP | |

### Stage 10 — Accounts and authentication
| Step | Work | Requirements |
|---|---|---|
| S10.1 [B] | Migration M4; Argon2id helpers (password; normalised answer); session store + middleware (idle 60 min, absolute 24 h, activity throttle) | AUTH-007, AUTH-011, SEC-001, SEC-002, PRV-001 (activity) |
| S10.2 [B] | Sign-up (uniqueness, 18+, **₹500 `signup_grant`** credit entry) | AUTH-001…003, D-43 |
| S10.3 [B] | Login (identifier detection, the same message for every failure), account lockout + client-keyed lockout for unknown identifiers, rate limits | AUTH-004…006, SEC-004, SD-38 |
| S10.4 [B] | Password reset (question chosen from the list, neutral responses, always one Argon2 verify, lockout, revoke sessions, notice flag) + notice at the next login | AUTH-008…010, D-42 |
| S10.5 [B] | Logout; `GET /auth/session`; **account recent searches** (store, list, clear) (PR-11) | AUTH-013, SRC-009 (customer) |
| S10.6 [F] | Login, sign-up and forgot-password pages; `LoginPromptDialog`; `intent-resume`; route guards; the logout confirmation and device clean-up | AUTH-013, AUTH-015, AUTH-016, AUTH-020 |
| S10.7 [F] | Session-expiry handling in the api-client (dialog, retry with the same idempotency key) | AUTH-011, PR-21 |
| **Verify** | Byte-identical responses for an unknown identifier vs a wrong password; lockout timing with the fake clock; reset never reveals the question; timing difference < 20 % between unknown and known identifiers; E2E UF-13 | |

### Stage 11 — Bag, wishlist, merge
| Step | Work | Requirements |
|---|---|---|
| S11.1 [B] | Migration M5; quote service for the bag (customer); `POST /bag/guest-quote` (not stored) | INT-001, PRC-* |
| S11.2 [B] | Bag line operations; flags (inactive, out of stock, over stock); price-change detection; limits | BAG-001, BAG-002, BAG-004, BAG-005, SD-12, T-27 |
| S11.3 [B] | Coupons: apply and remove, reasons, auto-removal, `GET /coupons/available`, guest preview | BAG-006, BAG-007, SD-03 |
| S11.4 [B] | Wishlist API (+ guest card view) and move-to-bag | WSH-001, WSH-002, PLP-014 |
| S11.5 [B] | Merge on login and sign-up: bag sum and cap, 50 lines, coupon precedence, wishlist union, **recent searches** | AUTH-012, AUTH-014, EC-15 |
| S11.6 [F] | `useBag` / `useWishlist` (device or API), the header badge | NAV-004, BAG-013, WSH-003 |
| S11.7 [F] | Bag page: lines and flags, quantity, Remove with Undo, Move to Wishlist, coupon UI, bank-offer preview, summary with the tax line and the free-delivery nudge, **guest pincode delivery block**, empty state | BAG-001…009, BAG-010 (guest part), BAG-012 |
| S11.8 [F] | Wishlist page (pages of 24, size picker) | WSH-001…004 |
| S11.9 [F] | PDP actions: Add to Bag (cap messages, "Go to Bag"), Buy Now (login prompt and resume; the checkout destination arrives in S14), wishlist toggle, stale-data handling | PDP-004, PDP-008…010, PDP-012 |
| **Verify** | Integration tests: each flag, coupon reason and merge case; E2E UF-01 complete | |

### Stage 12 — Profile, wallet, cards, support, demo help
| Step | Work | Requirements |
|---|---|---|
| S12.1 [B] | Migration M6; profile read and update (current password for sensitive fields, uniqueness, at least one identifier, age rule) | PRF-002, R-08 |
| S12.2 [B] | Credits ledger API; gift card redeem and list (expiry, status) | PRF-003, PRF-004, §7.6 |
| S12.3 [B] | Saved cards: test-card check, masked storage only, default rules | PRF-005, SEC-003, SD-10 |
| S12.4 [B] | Support requests (types, own orders only, request number) | PRF-006, T-37 |
| S12.5 [F] | Account home, Edit Profile, Credits, Gift Cards, Saved Cards, Contact Us pages; unseen-orders dot (fed later by S16) | PRF-001…006, PRF-007 (UI) |
| S12.6 [F] | `/demo-help`: test cards, UPI IDs, gift codes, return tags, **plus the Pexels image credit and photographer credits (OD-7)** | DAT-006, DAT-007, RET-006, D-22 |
| **Verify** | Ownership tests: every `/me/*` route returns `NOT_FOUND` for other accounts' ids; E2E profile flows | |

### Stage 13 — Addresses and map (Mapbox token before this stage)
| Step | Work | Requirements |
|---|---|---|
| S13.1 [B] | Migration M7; address API (validation, serviceability, 10-address limit, default rules) | ADDR-002, ADDR-004…006, ADDR-009 |
| S13.2 [F] | `AddressDetailsForm` + manual path (always-visible link) | ADDR-002, ADDR-003 |
| S13.3 [F] | `AddressMapStep` (lazy mapbox-gl, search, draggable pin, current location, reverse-geocode prefill, static preview), 10 s timeout and failure → manual | ADDR-001, ADDR-003, INT-005, EC-19 |
| S13.4 [F] | Saved Addresses page; reusable flow from the bag | ADDR-005, ADDR-008 |
| S13.5 [F/B] | **Deferred address-dependent parts (PR-09):** BAG-010 for customers (default or selected address, "Change", delivery date) and PDP-007's default pincode for logged-in customers | BAG-010 (customer), PDP-007 (customer) |
| **Verify** | E2E UF-14 with Mapbox blocked; an unserviceable address is saved and flagged | |

### Stage 14 — Checkout
| Step | Work | Requirements |
|---|---|---|
| S14.1 [B] | Migration M8; `POST /checkout` (bag or Buy Now source), re-validation with the change list (quoteDiff), the pending-order check | CHK-001, CHK-002, CHK-006, CHK-010, BAG-011 |
| S14.2 [B] | Phone step (saved to the account, or for this order only) | CHK-003, EC-14 |
| S14.3 [B] | Address selection (only serviceable), coupon, Buy Now quantity; stored checkout quotes with `quoteId` | CHK-004, CHK-005, API-006 |
| S14.4 [F] | Checkout pages: stepper, `ChangeSummary`, `PhoneStep`, address step (reusing S13), summary step, `PendingOrderDialog`; Proceed to Checkout wired from the bag; Buy Now destination | CHK-001…006, CHK-010, BAG-011 |
| S14.5 [F] | Checkout state survives session expiry (server session + resume) | CHK-007, UF-15 |
| **Verify** | Integration tests: EC-02, EC-03; E2E UF-03, UF-15 | |

### Stage 15 — Payment and order creation (PR-16 split)
| Step | Work | Requirements |
|---|---|---|
| S15.1 [B] | Migration M9 (orders, lines, attempts, allocations, events); idempotency middleware on payment routes | API-003, PAY-007 |
| S15.2 [B] | Payment selection: re-quote per change, gift card usable checks, COD limit, allowed methods | PAY-002, PAY-005, PRC-008…011 |
| S15.3 [B] | Pay, part 1: the pending-order guard, re-quote + diff (`QUOTE_CHANGED`), stock holds (`OUT_OF_STOCK`) — nothing persists on failure | PAY-006(a,b), INV-001, INV-006, R-09, SI-1 |
| S15.4 [B] | Pay, part 2: order, lines and snapshots, order number; wallet reservations; payment attempt with a pre-decided outcome; test-card and UPI recognition | PAY-006(c–f), INT-002, ADDR-007, ORD-001, PAY-003, PAY-004 |
| S15.5 [B] | Paths with nothing to charge online (r = 0, COD) → Placed: commit stock, capture, OTP generated | PAY-008, INV-002, DLV-001 (generation) |
| S15.6 [B] | Worker `resolvePaymentAttempts` (1 s tick): success / failure / cancelled / timed out; bag lines removed for bag checkouts; save the card when ticked | PAY-008…010, PAY-014, §7.4 |
| S15.7 [B] | Retry, the `/orders/:id/pay` guard, `expirePayments` | PAY-011, PAY-012, PAY-015, INV-003, EC-06 |
| S15.8 [F] | Payment step UI (demo warning, gift card select + inline redeem, credits toggle, methods, saved card + CVV / new card + "Save this card", UPI, Pay label from the quote) | PAY-001…005 |
| S15.9 [F] | Processing state and polling; outcome messages; retry flow | PAY-008, PAY-010, PAY-011 |
| S15.10 [F] | Confirmation page | PAY-013 |
| **Verify** | Concurrency tests (two Pays for the last unit; duplicate idempotency key; two tabs); EC-04…EC-07, EC-21, EC-24; WX-1 through the API; E2E UF-04, UF-05, UF-06 | |

### Stage 16 — Fulfilment, orders UI, delivery OTP
| Step | Work | Requirements |
|---|---|---|
| S16.1 [B] | Worker `advanceOrders` (timer from config; courier name and tracking ID at Shipped; `hasUnseenUpdate`) | ORD-004, T-14, INT-003, API-007 |
| S16.2 [B] | Orders list and detail APIs (headline status, expected date, timeline, payment breakdown); `POST /orders/:id/seen`; the unseen flag in the session | ORD-002, ORD-003, ORD-005…007, PRF-007 |
| S16.3 [B] | Delivery: OTP shown from Out for Delivery, confirm (5 tries per attempt), reject, `expireHandovers` (re-attempt, return to origin) | DLV-001…006, EC-22 |
| S16.4 [B] | Serialisation tests: customer actions racing worker transitions | API-008, EC-12 |
| S16.5 [F] | Orders list, order detail, `OrderTimeline`, tracking, `DeliverySimulatorPanel`, the unseen dot wired up | ORD-002, ORD-003, DLV-002, PRF-007 |
| **Verify** | Worker tests with the fake clock across all of §7.1; E2E UF-07, UF-09 (short test timers) | |

### Stage 17 — Refunds and cancellation
| Step | Work | Requirements |
|---|---|---|
| S17.1 [B] | Migration M10; refund service (allocation from the domain; ledger and gift-card entries at Refunded; expired gift card → credits); `completeRefunds` worker | RFD-001…007, §7.5 |
| S17.2 [B] | Refund preview; cancel a line (reason, restock, refund; the last line → Cancelled + delivery charge); cancel a pending order (release, reverse) | CNL-001…005, INV-003, INV-004 |
| S17.3 [B] | Whole-order refunds for Rejected at Delivery and Returned to Origin (uncollected COD isn't refunded) | DLV-005, DLV-006, EC-09 |
| S17.4 [F] | `CancelDialog` (reasons, refund preview), `RefundList` | CNL-003, RFD-006 |
| **Verify** | WX-3 and WX-4 through the API; the RFD-007 invariant after every refund; E2E UF-08, UF-10 | |

### Stage 18 — Returns
| Step | Work | Requirements |
|---|---|---|
| S18.1 [B] | Migration M11; return eligibility (window, returnability, returnable quantity) | RET-001 |
| S18.2 [B] | Create a return (quantity, reason, comment) | RET-002 |
| S18.3 [B] | Worker `advanceReturns` (weights or `#tags`, rejection reasons, pickup retry, closed) | RET-003…006, §7.3 |
| S18.4 [B] | Picked Up → restock + refund for those units | RET-007, INV-004 |
| S18.5 [F] | `ReturnFlow` and the return-state display on the order line | RET-001…005 |
| **Verify** | WX-2; EC-10, EC-11; E2E UF-11 (all three tags) | |

### Stage 19 — Invoices
| Step | Work | Requirements |
|---|---|---|
| S19.1 [B] | Migration M12; invoice snapshot at Shipped; availability rules | INV-I-001, INV-I-002 |
| S19.2 [B] | PDF (pdf-lib + fontkit + Noto Sans, labelled as a sample) | INV-I-003, R-35 |
| S19.3 [F] | `InvoiceView` + download link | INV-I-003 |
| **Verify** | Text extracted from the PDF contains ₹, the label, the lines, the tax portions and the total; `INVOICE_NOT_AVAILABLE` before Shipped | |

### Stage 20 — Reviews (write side)
| Step | Work | Requirements |
|---|---|---|
| S20.1 [B] | Eligibility; create, edit and delete; blocked words; the verified flag; aggregate recalculated in the same transaction | REV-003…009, REV-011 |
| S20.2 [B] | Image uploads (multer → sharp: type sniffing, ≤ 5 MB, EXIF stripped → local storage adapter) | REV-005, SEC-005 |
| S20.3 [B] | Report (logged in, not own, once each); hidden at 3; the author still sees their own hidden review | REV-010, REV-012, EC-16 |
| S20.4 [F] | Review entry points (PDP, order line), `ReviewForm`, report action | REV-004…006, REV-010 |
| **Verify** | Eligibility cases (cancelled line, returned item, never delivered); aggregates identical on the card, listing and PDP; E2E UF-12 | |

### Stage 21 — Privacy and demo operations
| Step | Work | Requirements |
|---|---|---|
| S21.1 [B] | `purgeInactiveAccounts` (30 days, deletion requests, skips non-terminal orders, anonymises reviews, ordered delete) | PRV-001…003, SEC-007 |
| S21.2 [B] | `resetDemoStock` (03:00 IST, skips held variants); cleanup jobs; inventory changes only through the inventory service | INV-005, INT-004, EC-17 |
| **Verify** | Worker tests with the fake clock | |

### Stage 22 — Hardening and local acceptance
| Step | Work | Requirements |
|---|---|---|
| S22.1 | Full E2E suite UF-01…UF-15 on Chromium, Firefox, WebKit + mobile | §8, FE-005 |
| S22.2 | axe on every route; a manual keyboard and screen-reader checklist | FE-004 |
| S22.3 | Lighthouse budgets on landing, PLP, PDP and bag; fix regressions | FE-006 |
| S22.4 | Security pass: authorisation on every route, Origin check, rate limits, log redaction, uploads, ID guessability | SEC-*, AUTHZ-* |
| S22.5 | Edge-case run EC-01…EC-24; `coverage-report` shows **0 uncovered spec IDs** (or explicit manual-check entries) | §14 |

### Stage 23 — Deployment (separate later phase; only with the owner's go-ahead)
Choose a host that supports an always-on worker and a persistent disk (or move to Postgres through Prisma). Add a reverse proxy so frontend and API share one origin, an S3-compatible storage adapter, production secrets, and a smoke test. **Planned in detail only when this phase starts.**

## 10. Verification strategy

| Layer | Tool | Scope | When |
|---|---|---|---|
| Unit | Vitest | `shared/` schemas; backend `domain/` (money, pricing WX-1, refunds WX-2…4, state machines, quoteDiff, search distance); frontend helpers (format parity, device-store TTL, intent-resume) | Every commit |
| Integration | Vitest + supertest, with a **fresh SQLite file per test file**, a fake `Clock` and a seeded `Random` | API routes and services: authorisation on every account route, idempotency, concurrency (two connections writing at once), every §13 error code, worker jobs over simulated time (§7.1, §7.3, PAY-012, PRV-001, INV-005), constraint enforcement | Every commit |
| Component | Vitest + React Testing Library | Mega menu keyboard, carousel controls, filter chips, size selector, payment selector labels | Per stage |
| End-to-end | Playwright (Chromium, Firefox, WebKit, 390 px) running the backend, worker and frontend preview | UF-01…UF-15. The test config sets short timers (`sim.statusStepInterval = 2 s`, handover 6 s, retry window 20 s), and uses forcing test cards, UPI IDs and `#tags`. | Per stage and at S22 |
| Accessibility | @axe-core/playwright + a manual checklist | FE-004, AUTH-016, NAV-005/006, LND-002 | S4 onwards |
| Responsive | Playwright at 360, 768, 1024 and 1280 px + a no-horizontal-scroll assertion | FE-001, GLB-001 | S4 onwards |
| Performance | Lighthouse CI on the preview build + bundle-size budgets | FE-006, §8.4 | S6, S7, S9, S11, S22 |
| Data | `seed:verify` | DAT-001…009, D-44 volumes, OD-6 repetition guardrails, licences, aggregates | Every seed |

**Coverage tracking:** test titles start with the requirement ID they prove (for example `PRC-005 …`). `backend/src/scripts/coverage-report.ts` lists any spec ID with no test, and S22.5 requires zero, apart from documented manual checks.

## 11. Technical risks and mitigations

| # | Risk | Mitigation |
|---|---|---|
| TR-1 | Pexels has few relevant photos for niche subcategories | Fall back to the parent category; OD-6 reuse with guardrails; `seed:verify` reports gaps; the S3 spot-check |
| TR-2 | ~2,000 template-generated products look repetitive | Varied per-subcategory templates, deterministic generation, the manual spot-check in S3 |
| TR-3 | **SQLite write contention** between the API and worker | WAL mode, short transactions with no external calls inside, write-first locking, `busy_timeout` + retry, concurrency tests. At this traffic level a single writer is ample. |
| TR-4 | **SPA performance** (no server rendering) | §8.4 budgets, data loading in parallel with code, image priority, Lighthouse gates |
| TR-5 | Concurrency bugs (double sell, duplicate orders) | Conditional stock updates, the partial unique index, idempotency, dedicated tests |
| TR-6 | Time-driven flows make tests flaky | Fake clock in integration tests; short configured timers and forced outcomes in E2E; seeded randomness |
| TR-7 | ₹ glyph in the PDF | Embedded Noto Sans via fontkit + a text-extraction test |
| TR-8 | Pexels or Mapbox keys not ready | Ask before S3.7 and S13. Clearly marked placeholder images may be used temporarily and are never committed as final. |
| TR-9 | Scope size (~290 requirements, 23 stages) | Small steps, a summary per stage, the riskiest logic first (S2) |
| TR-10 | Moving from SQLite to a server database at deployment time | Prisma supports a provider switch. Raw SQL is limited to the constraints file and tested. Revisited only in Stage 23. |
| TR-11 | The in-memory search index falls behind data changes | `catalogue_version` watcher (60 s) + rebuild; a test covers it |

## 12. Assumptions (technical only)

1. Local development runs on this machine (Linux, Node 24). Nothing has to be installed apart from `pnpm install`.
2. The Express backend is "the system" in the spec's sense. All authority sits in the backend.
3. `backend/seed-data/` is the config store's source. Values are changed by editing the files and running `pnpm config:sync`. There is no admin UI (I §10).
4. Test card numbers are invented Luhn-valid strings in our own table. They are never checked against real networks.
5. The client IP for rate limits and lockouts comes from the socket locally, and from trusted proxy headers after deployment.
6. Product images are served from the Pexels CDN. No image files are committed.

## 13. How the review findings were resolved

| PR | Resolution in this plan |
|---|---|
| PR-01 | React Router 7 (data mode) on Vite — §3, §8.1 |
| PR-02 | Top-level `frontend/` and `backend/` (API, domain, services, DB, worker, scripts, uploads) — §4 |
| PR-03 | Separate scripts per folder and process — §5 |
| PR-04 | `shared/` holds only the validation schemas and DTO types; the backend owns error messages — §4.3 |
| PR-05 | Prisma + SQLite; in-memory search; write-first locking — §6, §7.4 |
| PR-06 | SPA performance design and budgets — §8.4, S7.2, S22.3 |
| PR-07 | Vite dev proxy; same-origin cookie; Origin check; no CORS — §7.1 |
| PR-08 | Migration numbering aligned with the stages — §6.2 |
| PR-09 | The address-dependent parts of BAG-010 and PDP-007 are moved to S13.5 |
| PR-10 | Listings (S6) built before the landing page (S7) |
| PR-11 | Account recent searches in S10.5, merged in S11.5 |
| PR-12 | 1 s payment tick with a 2–3 s reveal → 2–4 s — §7.5 |
| PR-13 | S3 split into S3.4 to S3.6; pincodes from data.gov.in (GODL) |
| PR-14 | Generator split into S3.8 to S3.10, plus a spot-check |
| PR-15 | Listing split into S6.1 to S6.4 |
| PR-16 | Pay split into S15.3 to S15.7; returns split into S18.1 to S18.4 |
| PR-17 | Cached-page scroll restore — §8.2 |
| PR-18 | `quoteDiff` change-list format — §7.3, S2.4 |
| PR-19 | `@pdf-lib/fontkit` added |
| PR-20 | `sharp` added |
| PR-21 | Idempotency key kept per action and re-sent after re-login — §8.2, S10.7 |
| PR-22 | `catalogue_version` watcher — §7.4 |
| PR-23 | Hand-written constraint SQL + rejection tests — §6.1, S3.2 |
| PR-24 | `Secure` cookie in production only — §7.1 |
| PR-25 | Guest quotes are never stored — §7.2 |
| PR-26 | CSRF = SameSite + Origin check only — §7.1 |
| PR-27 | Packages collapsed into `backend/src/*`; no `ui` package |
| PR-28 | Pexels credit on `/demo-help`; the footer is unchanged — S5.4, S12.6 |
| PR-29 | `rating_aggregate` defined as a derived cache — §6.2 |
| PR-30 | Image reuse approved, with measurable guardrails — S3.10 |

## 14. Implementation interpretations (no behaviour change)

| # | Spec text | Interpretation |
|---|---|---|
| SI-1 | INT-002 vs PAY-006(a) | Failures before the order is created persist nothing. Payment-attempt outcomes after creation are recorded on the Awaiting Payment order. |
| SI-2 | PAY-008 "2–4 seconds" | The outcome is decided at Pay and revealed by the 1 s worker tick 2–3 s later; the client polls |
| SI-3 | REV-011 "within 1 minute" | Updated in the same transaction (immediately) |
| SI-4 | AUTH-006/009 "per client" | Keyed by client IP + normalised identifier |
| SI-5 | AUTH-008 "same latency profile" | Always one Argon2 verify per attempt (a dummy hash when there's nothing to compare) |
| SI-6 | NAV-010 "path navigated from" | The client keeps the last listing node in sessionStorage as a hint; the server validates it |
| SI-7 | FE-006 is a field metric | Verified with Lighthouse lab runs locally; field data after deployment |
| SI-8 | ORD-004 / DLV-006 timers | `next_transition_at` per row, worker tick 5 s, so ±5 s accuracy |
| SI-9 | DAT-005 pincodes | Real pincodes from the India Post / data.gov.in directory, labelled as sample data |
| SI-10 | PRV-001 deletes orders | Coupon-use counts and gift-card redemptions of purged accounts disappear; accepted under D-43 |

**No new product requirements are introduced, and no approved decision is changed.** OD-6 and OD-7 are your decisions from this round. The guardrails in S3.10 make OD-6's "not obviously repetitive" measurable.

## 15. Requirement coverage

A script checks that every requirement, edge-case, flow and worked-example ID in `spec.md` maps to at least one step in §9. S22.5 repeats the check against test titles.

## 16. Approval checklist
1. The tech stack (§3), layout and boundaries (§4), and scripts (§5).
2. SQLite concurrency approach (§6.3) and in-memory search (§7.4).
3. The image repetition guardrails (S3.10).
4. Interpretations SI-1 to SI-10.
5. Git workflow: a branch per stage, which you merge.
6. Keys: Pexels before S3.7, Mapbox before S13.

Once approved, implementation starts at Stage 0, with a summary after each stage.
