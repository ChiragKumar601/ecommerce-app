# Functional Specification — Fashion & Lifestyle Ecommerce (Customer Web App, V1)

> **Status:** v1.1, **READY FOR IMPLEMENTATION PLANNING**. Derived from `intent.md` v2.1. Open questions SQ-1 to SQ-3 were resolved by the owner on 2026-10-06 (§17).
> **Date:** 2026-10-06
> **Source of truth:** `intent.md`. Where this spec and the intent differ, the intent wins, and the difference is a defect in this spec.
> **Out of scope for this document:** tech stack, frameworks, hosting, database choice and code. The API contracts in §11 are **logical**: operations, inputs, outputs and errors. Transport and paths are illustrative and are finalised in the architecture phase.

---

## 0. Conventions

- **MUST / MUST NOT / SHOULD / MAY** have their RFC 2119 meaning. Every requirement with a `MUST` is testable.
- **Requirement IDs** take the form `AREA-NNN`, for example `BAG-012`. IDs are stable: they are never renumbered. Requirements that are removed are marked *withdrawn*.
- **Traceability:** each requirement cites its intent source as `[I §x]` (an intent section) or `[D-n]` / `[R-n]` / `[T-n]` (a decision tag in the intent).
- **[SD-n]** is a *spec decision*: a value or interpretation chosen while writing this spec, inside the latitude the intent delegated to the team. Every SD is listed in §16, and the owner can override any of them.
- **[SQ-n]** is a question raised while writing the spec. Each one has been resolved by the owner (§17) and is recorded in the intent as D-42 to D-44.
- **Money:**
  - All amounts are in INR. The system stores money as **integer paise**.
  - Amounts are displayed with "₹" and Indian digit grouping (₹1,23,456). Paise are shown only when they are not zero. [T-35, SD-01]
- **Time:**
  - All business dates and times are in **IST (UTC+05:30)**.
  - Durations such as "14 days" are measured in elapsed time from the triggering timestamp. [SD-02]
- **"System"** means the system of record, the server side. **"Client"** means the web front end.

## 1. Scope

**In scope:** the customer-facing responsive web application and the server behaviour it relies on, as listed in intent §9.

**Out of scope:** everything in intent §10. Admin tools, real payments, real logistics, notifications, AI features and native apps are all **out**.

**Product context:** V1 is a **publicly accessible showcase**. It must offer a production-quality experience, must be clearly labelled as a demo, and must process no real transactions. [R-01]

## 2. Roles & permissions

### 2.1 Actors

| Actor | Description |
|---|---|
| **Guest** | An unauthenticated visitor. Their identity is a **device** (browser storage). |
| **Customer** | An authenticated account holder. |
| **Delivery simulator** | A demo actor that plays the delivery person. It is operated from a labelled panel on the order owner's order page. [D-41] |
| **System scheduler** | A server-side process. It advances simulated statuses, expires payment windows and resets demo stock. |

There is **no admin role** in V1. [I §10]

### 2.2 Permission matrix

| Capability | Guest | Customer | Notes |
|---|---|---|---|
| Browse landing, listings, search, product pages, reviews, policy pages | ✅ | ✅ | |
| Bag: add, update, remove, view | ✅ (device) | ✅ (account) | [D-3] |
| Wishlist: add, remove, view | ✅ (device) | ✅ (account) | [D-30] |
| Apply coupon in bag | ✅ (preview only) | ✅ | Final validation happens at checkout [SD-03] |
| Pincode check | ✅ | ✅ | [R-21] |
| Buy Now, Proceed to Checkout, Pay | ❌ → login prompt | ✅ | [D-37] |
| Profile, Orders, Addresses, Saved Cards, Gift Cards, Credits, Edit Profile, Contact Us | ❌ → login prompt | ✅ own data only | [I §6.7] |
| Write, edit or delete a review | ❌ | ✅ when eligible; own reviews only | [D-12] |
| Report a review | ❌ | ✅, not own reviews | [R-18] |
| Delivery simulator actions | ❌ | ✅ on own orders, Out for Delivery only | [D-41] |

**AUTHZ-001** — Every operation that reads or changes account-scoped data **MUST** check that the authenticated customer owns that data. This covers profile, addresses, cards, gift cards, credits, orders, returns, refunds, reviews (for edit and delete), support requests and the bag/wishlist. [I §7.3]

**AUTHZ-002** — When a customer requests a resource they don't own, the system **MUST** answer exactly as it would for a resource that doesn't exist (`NOT_FOUND`). It must never reveal that the resource exists. [I §7.3]

**AUTHZ-003** — Guest-only device data (guest bag, guest wishlist, guest recent searches, remembered pincode) **MUST NOT** be readable by any other device or account. [I §6.7]

## 3. System context & component interactions (logical)

| Component | Responsibility |
|---|---|
| **Web client** | Pages, client-side validation, device storage for guest data, display of system-computed values. It never computes authoritative prices, eligibility or status. [I §7.1] |
| **Catalogue & search** | Catalogue tree, products and variants, facets, search with typo tolerance, suggestions, recommendations. |
| **Pricing engine** | Computes every price, discount, coupon, bank offer, delivery charge, tax portion and payable amount (§6.13). It is the only source of amounts. |
| **Inventory** | Stock per variant, holds for Awaiting Payment orders, commits, releases, restocks, periodic demo reset. |
| **Accounts & auth** | Sign-up, login, sessions, lockouts, password reset, profile. |
| **Wallet** | Credits ledger and redeemed gift cards. |
| **Orders** | Order creation, status machine, line after-sale states, returns, refunds, invoices. |
| **Payment simulator** | Simulates card and UPI outcomes. Recognises test values. |
| **Fulfilment simulator** | The scheduler that drives order, delivery, return and refund transitions. Also backs the Delivery simulator panel. |
| **Map / geocoding provider** | External. Place search, pin reverse-geocoding and map display. The provider is chosen in the architecture phase. [R-23] |
| **Media storage** | Product images (with licence metadata) and review images. |
| **Config store** | All configurable content and values in §5. It can be changed without rebuilding the UI. [I §7.9] |

**Key interactions**, which the architecture **MUST** preserve:

| ID | Interaction |
|---|---|
| **INT-001** | The client asks the Pricing engine for a **quote** for the bag or checkout. Every displayed amount in bag, checkout and payment comes from the most recent quote. |
| **INT-002** | **Pay** is a single atomic operation. It re-quotes, validates, creates the Awaiting Payment order, places stock holds, reserves the wallet amounts, then calls the Payment simulator. If any step fails, nothing persists except a failed attempt record (§6.15). |
| **INT-003** | The Fulfilment simulator is the only component that advances order, delivery, return and refund states automatically. Customer actions (cancel, return request, simulator OTP or reject) go through the Orders component, which validates them against the current state. |
| **INT-004** | Inventory changes happen only through Orders events (hold, commit, release, restock) or the scheduled demo reset. |
| **INT-005** | Map provider failures **MUST NOT** block address entry. The manual path is always available (ADDR-003). |

## 4. Domain model

Entities are logical. Storage design is decided in the architecture phase.

### 4.1 Catalogue
| Entity | Key attributes | Rules |
|---|---|---|
| **CatalogueNode** | id, type (`section` \| `category` \| `subcategory`), name, slug, parentId, displayOrder, active | Sections: Men, Women, Kids, Home, Beauty, Gen Z. The tree is at most 3 levels deep. A slug is unique among its siblings. [I §6.1] |
| **Brand** | id, name, slug | Brand names are fictional. [D-28] |
| **Product** (a style) | id, slug, brandId, name, subtitle, description, materialCare, specifications (key/value list), primarySectionId, nodeIds[] (≥1 subcategory; may span sections), gender (`men` \| `women` \| `boys` \| `girls` \| `unisex` \| `infant` \| `none`), colour, listingDate, bestSeller (bool), bankOfferEligible (bool), returnable (bool, derived from category policy), inclusiveSizing (bool), sizeGuideId (nullable), images[] (≥1), active | Each colour is a **separate product**. Variants differ only by size. [SD-04] The card sub-label is `subtitle`. [I §6.4, SD-04] |
| **Variant** (a SKU) | id, productId, sizeLabel (or "One size"), mrp (paise), sellingPrice (paise), active | sellingPrice ≤ mrp. Discount % = floor((mrp − sellingPrice) / mrp × 100). [SD-05] |
| **InventoryRecord** | variantId, onHand, held, baselineOnHand | available = onHand − held, and is never below 0. |
| **ProductImage** | id, productId, url, alt, order, source, licence, attributionText (nullable) | Every image **MUST** record its source and licence. [D-22] |
| **SizeGuide** | id, table (rows × columns), notes | Linked from apparel and footwear products. [I §6.5] |

### 4.2 Reviews
| Entity | Key attributes | Rules |
|---|---|---|
| **Review** | id, productId, authorAccountId (null for seeded), authorDisplayName, rating (1–5), text (optional), images[] (≤5), verifiedPurchase (bool), status (`visible` \| `hidden`), createdAt, updatedAt, seeded (bool) | One review per (account, product). Seeded reviews have verifiedPurchase = false. [T-19, R-20] |
| **ReviewReport** | reviewId, reporterAccountId, createdAt | Unique per (review, reporter). |
| **RatingAggregate** | productId, average (1 decimal), count, countByStar[5] | Computed from **visible** reviews only. [SD-06] |

### 4.3 Accounts & identity
| Entity | Key attributes | Rules |
|---|---|---|
| **Account** | id, name, email (nullable, unique), phone (nullable, unique), passwordHash, securityQuestionId, securityAnswerHash, gender (nullable), dateOfBirth (nullable), ageConfirmedAt, createdAt, failedLoginCount, lockedUntil, failedResetCount, resetLockedUntil, passwordChangedAt, passwordChangeNoticePending (bool), lastActivityAt | At least one of email and phone is always present. Email and phone are each unique across accounts. [D-1, R-08] |
| **SecurityQuestion** | id, text, active | A predefined list. [R-11] |
| **Session** | id, accountId, createdAt, lastActivityAt, expiresAt, revokedAt | §6.8 session rules. |
| **RecentSearch** | owner (accountId or device), term, searchedAt | At most 10 per owner. [SD-07] |

### 4.4 Addresses, cards & wallet
| Entity | Key attributes | Rules |
|---|---|---|
| **Address** | id, accountId, recipientName, recipientPhone, houseFlat, building, streetArea, landmark (optional), city, state, pincode, label (`Home` \| `Work` \| `Other` + custom text), latitude/longitude (nullable when entered manually), isDefault, serviceable (derived) | At most 10 per account. Exactly one default if any exist. [SD-08, SD-09] |
| **SavedCard** | id, accountId, nameOnCard, last4, network, issuingBank, expiryMonth, expiryYear, isDefault, testCardRef | Never stores the full PAN or CVV. At most 5 per account. [T-60, SD-10] |
| **CreditLedgerEntry** | id, accountId, amount (+/−), type (`signup_grant` \| `order_debit` \| `order_debit_reversal` \| `refund_credit`), orderId (nullable), refundId (nullable), createdAt, note | Balance = sum of entries. Credits don't expire. [SD-11] |
| **GiftCardCode** (definition) | code, faceValue, validityDays, active | A published demo list. [R-31] |
| **AccountGiftCard** | id, accountId, code, initialBalance, balance, redeemedAt, expiresAt, status (`active` \| `exhausted` \| `expired`) | Unique per (account, code). [R-31] |
| **GiftCardTransaction** | id, accountGiftCardId, amount (+/−), type (`redeem` \| `order_debit` \| `order_debit_reversal` \| `refund_credit`), orderId, createdAt | |

### 4.5 Bag & wishlist
| Entity | Key attributes | Rules |
|---|---|---|
| **Bag** | owner (accountId or device), lines[], appliedCouponCode (nullable), updatedAt | A guest bag lives on the device. [D-3] |
| **BagLine** | variantId, quantity (1–10), addedAt, lastSeenUnitPrice | Unique per variant within a bag. At most 50 lines. [T-27, SD-12] |
| **Wishlist** | owner, entries[] (productId, addedAt) | Unique per product. A product, not a size. [T-26] |
| **GuestDeviceData** | bag, wishlist, recentSearches, rememberedPincode, lastUpdatedAt | Discarded 30 days after lastUpdatedAt. [T-57, SD-13] |

### 4.6 Pricing configuration
| Entity | Key attributes |
|---|---|
| **Coupon** | code (case-insensitive), description, type (`percent` \| `flat`), value, maxDiscount (for percent), minEligibleValue, eligibleNodeIds[] (empty = all), validFrom, validTo, perCustomerLimit, active [R-25] |
| **BankOffer** | id, bankName ("HDFC Bank"), cardTypes (`credit`, `debit`), percent, maxDiscount, minEligibleValue, validFrom, validTo, termsText, active [R-07] |
| **DeliveryConfig** | freeDeliveryThreshold (₹1,999, strictly greater than), flatCharge, codMaxPayable [D-27, T-16, T-59] |
| **TaxRate** | nodeId (section or category), ratePercent. The most specific node wins. [R-35] |
| **ServiceablePincode** | pincode, zone (`A` \| `B` \| `C`) |
| **DeliveryZone** | zone, deliveryDays [T-17] |
| **ReturnPolicy** | returnWindowDays (14), nonReturnableNodeIds[] [R-17] |

### 4.7 Orders
| Entity | Key attributes | Rules |
|---|---|---|
| **Order** | id, orderNumber, accountId, status (§7.1), createdAt, placedAt, deliveredAt, addressSnapshot, contactPhone, lines[], priceSnapshot (the full quote at Pay), paymentSelection, paymentAttempts[], allocations[], deliveryOtp, deliveryAttemptNumber (0–2), courierName, trackingId, couponCode, bankOfferApplied, invoiceId, hasUnseenUpdate, source (`bag` \| `buy_now`) | Prices are **locked** at Pay. [D-39] |
| **OrderLine** | id, variantId, productSnapshot (name, brand, size, image), quantity, unitMrp, unitSellingPrice, couponShare, bankOfferShare, lineNetPaid, taxPortion, lineState (`active` \| `cancelled`), returnable, returnWindowEndsAt | |
| **PaymentAttempt** | id, orderId, idempotencyKey, method (`card` \| `upi` \| `cod` \| `none`), cardRef/upiId, amount, outcome (`pending` \| `success` \| `failure` \| `cancelled` \| `timed_out`), forcedByTestValue (bool), createdAt | At most one `pending` per order. |
| **PaymentAllocation** | orderId, source (`card` \| `upi` \| `cod` \| `gift_card` \| `credits`), amount, accountGiftCardId (nullable), status (`reserved` \| `captured` \| `released` \| `cod_due` \| `cod_collected`) | |
| **ReturnRequest** | id, orderLineId, quantity, reason, comment, status (§7.3), pickupAttempt (0–2), outcomeForcedBy (nullable), rejectionReason, closedReason, createdAt | |
| **Refund** | id, orderId, trigger (`cancellation` \| `return` \| `rejected_at_delivery` \| `returned_to_origin`), amount, includesDeliveryCharge, allocations[] (destination, amount), status (`initiated` \| `refunded`), createdAt, completedAt | |
| **OrderStatusEvent** | orderId, fromStatus, toStatus, at, actor (`customer` \| `scheduler` \| `delivery_simulator` \| `system`) | Feeds the timeline. |
| **Invoice** | id, orderId, number, generatedAt, lines with tax portions, label "Sample invoice — not a tax document" | [R-35] |

### 4.8 Merchandising & support
| Entity | Key attributes |
|---|---|
| **HeroSlide** | id, image, alt, headline, href, order, active (at most 8 active) [R-38] |
| **ShopByCategoryCard** | id, name, image, alt, discountText, href, order, active [I §6.2] |
| **PopularSearch** | term, order [T-20] |
| **ContentPage** | slug, title, body, isPlaceholder |
| **FaqEntry** | topic, question, answer, order |
| **SupportRequest** | id, requestNumber, accountId, type (`order_issue` \| `payment` \| `return_refund` \| `account` \| `account_deletion` \| `other`), orderId (optional), message, status (`submitted`), createdAt [T-37, R-19] |

## 5. Configuration values

All of these values live in the config store. They can be changed without rebuilding the UI. [I §7.9]

**Values marked SD are proposed defaults.** The owner may override them (§16).

| Key | Default | Source |
|---|---|---|
| `delivery.freeThreshold` | Free delivery when the bag value after discounts and coupon is **> ₹1,999** | D-27, T-16 |
| `delivery.flatCharge` | ₹99 | SD-14 |
| `cod.maxPayable` | ₹10,000. Applies to the amount payable on delivery. | T-59, SD-14 |
| `bankOffer.HDFC` | 10% instant discount, maximum ₹1,000, minimum eligible value ₹2,500, HDFC credit and debit cards | R-07, SD-15 |
| `coupons` (seed) | **WELCOME10:** 10%, max ₹300, min ₹999, all categories, 1 use per customer. **FLAT200:** ₹200, min ₹1,499, fashion sections, 2 uses per customer. **BEAUTY15:** 15%, max ₹250, min ₹799, Beauty, 1 use per customer. **EXPIRED50:** expired, kept for testing. | R-25, SD-16 |
| `tax.rates` | Illustrative, labelled sample. Apparel, footwear and accessories 5%. Beauty and personal care 18%. Jewellery 3%. Home 18%. Gadgets 18%. Toys and school supplies 12%. | R-35, SD-17 |
| `returns.windowDays` | 14 | T-8 |
| `returns.nonReturnable` | Innerwear (Men, Women, Kids), Lingerie, Beauty (whole section), Men → Personal Care, Women → Beauty & Personal Care, Kids → Baby Care (feeding, diapers, baby skincare) | R-17 |
| `delivery.zones` | Zone A: 2 days. Zone B: 4 days. Zone C: 6 days. The serviceable pincode list is seed data. | T-17, SD-18 |
| `sim.statusStepInterval` | 2 minutes per automatic transition | T-61, SD-19 |
| `sim.paymentRetryWindow` | 15 minutes | D-39 |
| `sim.deliveryHandoverWindow` | 10 minutes per delivery attempt | D-41, SD-19 |
| `sim.paymentOutcomeWeights` | success 70%, failure 15%, cancelled 10%, timed out 5% | D-34, SD-20 |
| `sim.returnOutcomeWeights` | approve 80% / reject 20%. Pickup success 80% / fail 20%. | T-61, SD-20 |
| `sim.stockResetSchedule` | Daily at 03:00 IST | R-16, SD-21 |
| `auth.sessionAbsoluteLifetime` / `auth.sessionIdleTimeout` | 24 hours / 60 minutes | T-24, SD-22 |
| `auth.loginLockout` | 5 consecutive failures → 15-minute lock | R-12 |
| `auth.resetLockout` | 5 consecutive wrong answers → 15-minute lock | T-23 |
| `listing.pageSize` | 24 products | SD-23 |
| `search.suggest` | Minimum 2 characters, at most 8 items, 250 ms debounce | R-29, SD-23 |
| `bag.maxQtyPerLine` / `bag.maxLines` | 10 / 50 | T-27, SD-12 |
| `reviews` | At most 5 images, JPEG/PNG/WebP, ≤ 5 MB each. Text ≤ 2,000 characters. Report threshold 3. | T-19, R-18, SD-24 |
| `guest.retentionDays` | 30 | T-57 |
| `credits.signupGrant` | ₹500 credited once at sign-up | D-43, SD-65 |
| `privacy.inactivityPurgeDays` | 30 | D-43 |
| `carousel.autoplay` | 5 seconds; at most 8 slides | R-38 |
| `demoBanner.text` | "Demo store — for showcase only. No real orders, payments or deliveries." | R-01, SD-25 |

## 6. Functional requirements

### 6.1 Global behaviour

| ID | Requirement | Source |
|---|---|---|
| GLB-001 | Every page **MUST** show the demo banner (`demoBanner.text`) at the top. It **MUST NOT** be dismissible, and **MUST** stay visible at every FE-001 width. | R-01, SD-25 |
| GLB-002 | Every data-driven view **MUST** implement four states: **loading** (a skeleton or spinner within 100 ms of the request), **empty** (a specific message and a next action), **success**, and **error** (a specific message and Retry). | I §7.6 |
| GLB-003 | User-facing error messages **MUST** come from the catalogue in §13. Raw system errors, stack traces and error codes **MUST NOT** be shown to the customer. | I §7.6 |
| GLB-004 | Every action that changes data **MUST** disable its trigger while the request is in flight, to prevent double submission. | I §7.4 |
| GLB-005 | A "page not found" screen **MUST** be shown for unknown routes and unknown or inactive catalogue slugs. It **MUST** include search and a link to the landing page. | SD-26 |

### 6.2 Header, navigation & URLs

| ID | Requirement | Source |
|---|---|---|
| NAV-001 | The header **MUST** show the logo, which links to `/`. | I §6.1 |
| NAV-002 | The header **MUST** show Men, Women, Kids, Home, Beauty and Gen Z, in that order, from active section nodes. | I §6.1 |
| NAV-003 | The header **MUST** show Search, Profile, Wishlist and Bag icons, each with a visible text label below it. | I §6.1 |
| NAV-004 | The Bag icon **MUST** show the **total units** in the bag. It **MUST** be hidden when the bag is empty, and **MUST** update within 1 second of any bag change. | I §6.10, SD-27 |
| NAV-005 | At widths ≥ 1024 px, hovering over or keyboard-focusing a section **MUST** open its mega menu, listing categories with their subcategories. The menu **MUST** close on mouse leave (after a 150 ms grace period), on Escape, or when focus leaves it. | I §6.1, R-27 |
| NAV-006 | At widths < 1024 px, a menu button **MUST** open a slide-out drawer with expandable Section → Category → Subcategory levels. It **MUST** trap focus while open and return focus to the menu button on close. | T-32 |
| NAV-007 | The mega menu and drawer **MUST** be generated from the catalogue tree. Adding, removing or reordering a node in data **MUST** be reflected without UI code changes. | I §6.1 |
| NAV-008 | At widths ≥ 1024 px the search input **MUST** always be visible in the header. Below 1024 px, a search icon opens a full-screen search overlay. | T-31 |
| NAV-009 | Routes **MUST** follow §10.1. A section listing is `/shop/<section>`. Category and subcategory listings are `/<section>/<category>[/<subcategory>]`. | T-5 |
| NAV-010 | Breadcrumbs on product pages **MUST** use the catalogue path the customer navigated from, if it contains the product. Otherwise they use the product's primary section → first category → first subcategory. | T-29 |

### 6.3 Landing page

| ID | Requirement | Source |
|---|---|---|
| LND-001 | The sections **MUST** appear in this order: hero carousel, bank-offer tile, Shop by Category, footer. | I §6.2 |
| LND-002 | The carousel **MUST** render the active HeroSlides in `order`, at most 8. It **MUST** autoplay every 5 seconds and pause on hover, on keyboard focus within the carousel, and when the user presses Pause. It **MUST** have visible Previous, Next and Pause/Play controls, all keyboard-operable. Each slide **MUST** navigate to its `href`. | R-38 |
| LND-003 | At least one active slide **MUST** link to the Best Seller Styles listing. | R-34 |
| LND-004 | The bank-offer tile **MUST** show the BankOffer summary and a "T&C apply" link that opens `termsText`. Activating the tile **MUST** open the bank-offer listing (§10.1), which is filtered to `bankOfferEligible = true`. That filter shows as an applied chip that can be cleared. | D-4, R-07 |
| LND-005 | Shop by Category **MUST** render every active card in `order`, each showing image, name, discountText and a "Shop Now" call to action. The whole card is clickable and navigates to `href`. The number of cards is unlimited, and the grid wraps onto new rows. | I §6.2 |
| LND-006 | Card images **MUST** use one fixed aspect ratio (3:4) and be cropped to fill it, so cards in a row stay aligned whatever the source dimensions. Columns: ≥ 1280 px: 6; ≥ 1024: 5; ≥ 768: 4; < 768: 2. | I §6.2, SD-28 |
| LND-007 | The footer **MUST** contain, in order:<br>1. useful links (Blog, Careers, Sitemap, Corporate Information), the policy links (Terms of Use, Privacy Policy, Returns & Refunds Policy, Shipping Policy) and the trust pointers, including "100% ORIGINAL" and "Easy 14-day returns on eligible items"<br>2. popular searches, each linking to a search for that term<br>3. registered address, telephone and CIN, labelled "Sample details"<br>4. "How we make shopping easy" with 3–5 statements<br>5. social media links. | I §6.2, R-17, R-19, T-38 |
| LND-008 | Placeholder content pages **MUST** show a visible "Placeholder content" label. | T-38, R-19 |

### 6.4 Search

| ID | Requirement | Source |
|---|---|---|
| SRC-001 | After at least 2 characters and a 250 ms pause in typing, the client **MUST** request suggestions. The suggestion list shows at most 8 entries, in groups in this order: recent searches that match, categories, brands, products, popular searches. Empty groups are omitted. | R-29, SD-23 |
| SRC-002 | With an empty input and focus in search, the client **MUST** show up to 5 recent searches and up to 5 popular searches. | R-29 |
| SRC-003 | Search **MUST** match against product name, subtitle, brand name, catalogue node names, colour, and specification values. | I §6.3 |
| SRC-004 | **Typo tolerance:** a query word of ≤ 5 characters **MUST** match words within edit distance 1, and a longer word within edit distance 2. Exact matches **MUST** rank above fuzzy ones. *Testable: "snaekers" returns products whose name contains "sneakers".* | R-26 |
| SRC-005 | Pressing Enter with a non-empty query **MUST** go to `/search?q=<term>`. Choosing a suggestion **MUST** go to that product's page, that category's listing, the search results filtered by that brand, or a search for that term. | I §6.3 |
| SRC-006 | The search results page **MUST** provide every listing capability (§6.5): filters, sort, count, chips, clear, infinite scroll. | I §6.3 |
| SRC-007 | When there are zero results, the page **MUST** show "No results for '<term>'", the popular searches, and links to the 6 sections. | I §6.3 |
| SRC-008 | Searching within a category **MUST** be the same as search with that node pre-applied as a removable filter chip. | R-29 |
| SRC-009 | A successful search **MUST** store the term in recent searches: on the device for guests, on the account for customers. Stored terms are de-duplicated case-insensitively, the most recent goes first, and at most 10 are kept. A "Clear recent searches" action **MUST** remove them all. | T-20, R-29, SD-07 |
| SRC-010 | Queries **MUST** be trimmed and limited to 100 characters. Empty or whitespace-only queries are ignored. | SD-29 |

### 6.5 Product listing pages (PLP)

| ID | Requirement | Source |
|---|---|---|
| PLP-001 | These listing types **MUST** exist: section, category, subcategory, all-products (`/shop/all`), search, bank-offer, Best Seller Styles. | I §6.4 |
| PLP-002 | **Filters** with facet counts: gender, category (catalogue nodes within the current scope), brand (multi-select), price (a range slider plus min/max inputs, on sellingPrice), colour (multi-select), discount (minimum % in buckets: 10, 20, 30, 40, 50, 60, 70), size (multi-select, from variants with available > 0), customer rating (4★ & above, 3★ & above), and **in-stock only** (a toggle). A facet with no values in scope **MUST** be hidden. For example, gender is hidden on Home listings. | I §6.4, T-50, SD-30 |
| PLP-003 | **Sort options:**<br>• **Recommended** (default): score = 0.5 × Bayesian rating + 0.3 × normalised log(rating count + 1) + 0.2 × recency (listingDate within 90 days decays linearly to 0)<br>• **What's New:** listingDate, newest first<br>• **Price:** low to high, and high to low<br>• **Discount:** highest first<br>• **Customer Rating:** average rating, highest first; ties broken by count | R-30, SD-31 |
| PLP-004 | Out-of-stock products (every variant has available = 0) **MUST** be listed after in-stock products, whatever the sort. When the in-stock-only toggle is on, they **MUST** be excluded. | T-46 |
| PLP-005 | The page **MUST** show the total matching product count, for example "1,248 items". The count **MUST** update after every filter change. | I §6.4 |
| PLP-006 | Every applied filter **MUST** appear as a removable chip. "Clear all" **MUST** remove all filters except the listing's defining scope. A search term is part of that scope, and so is the bank-offer listing's eligibility filter — but that one can still be removed through its own chip. | I §6.4 |
| PLP-007 | Results **MUST** load 24 per page by infinite scroll. If loading the next page fails, a "Load more" button **MUST** appear. When the last page is reached, "You've seen all items" **MUST** be shown. | T-20, SD-23 |
| PLP-008 | Filter, sort and page state **MUST** be reflected in the URL query. Returning from a product page with Back **MUST** restore the same results and scroll position. | T-20 |
| PLP-009 | **Filter persistence:** moving to another listing **within the same section** **MUST** carry over the sort and the shared filters (brand, price, colour, size, rating, discount, in-stock), as long as each still has matching values. Filters with no matching values are dropped silently. Moving to a different section **MUST** reset all filters and the sort. | R-26 |
| PLP-010 | Desktop (≥ 1024 px) **MUST** show filters in a left sidebar. Below 1024 px, "Filter" and "Sort" buttons **MUST** open bottom sheets. Changes apply on "Apply", and "Clear" resets them. | I §6.4 |
| PLP-011 | **Product card:**<br>• image (fixed 3:4)<br>• rating badge (average to 1 decimal, and count in compact form such as "1.2k")<br>• brand<br>• name (truncated to 1 line with an ellipsis)<br>• subtitle (truncated to 1 line)<br>• price<br>• wishlist toggle<br>There is no border. | I §6.4 |
| PLP-012 | **Card price:** when sellingPrice < mrp, the card shows sellingPrice, then the struck-through mrp, then "(<d>% OFF)". Otherwise it shows sellingPrice only. A product has several variants with different prices, so the card uses the **lowest-priced available variant**, or the lowest-priced variant if none is available. | I §6.4, SD-32 |
| PLP-013 | Products with zero visible reviews **MUST NOT** show a rating badge. Out-of-stock products **MUST** show an "Out of stock" label. | T-46 |
| PLP-014 | The card's wishlist toggle **MUST** add or remove the product optimistically. If the system rejects the change, the toggle **MUST** revert and show an error. It works for guests too, using device storage. | I §6.4, D-30 |
| PLP-015 | **Best Seller Styles** is a listing of products with `bestSeller = true`. | T-44 |

### 6.6 Product detail page (PDP)

| ID | Requirement | Source |
|---|---|---|
| PDP-001 | **Gallery:** every product image in `order`, with thumbnails. Selecting an image opens a full-screen viewer with zoom (pinch on touch, click to zoom on desktop), swipe or arrow navigation, and Escape to close. | I §6.5 |
| PDP-002 | The page **MUST** show brand, name, subtitle, the rating badge with count (hidden if no reviews), sellingPrice, the struck-through mrp, and discount % for the selected (or default) variant. It **MUST** also show "Inclusive of all taxes". | I §6.5, D-36 |
| PDP-003 | **Sizes:** every variant appears as a size selector. Variants with available = 0 **MUST** be shown disabled with a strikethrough and "Out of stock" as their accessible name. Other colours are separate products and **MUST** be shown as linked swatches when present ("More colours"). | I §6.5, SD-04 |
| PDP-004 | Add to Bag or Buy Now without a selected size (when there's more than one variant) **MUST** show "Please select a size" and focus the size selector. A product with a single "One size" variant **MUST** select it automatically. | I §6.5 |
| PDP-005 | **Offers block:** the bank offer (if bankOfferEligible), showing the offer summary and terms link, plus up to 3 active coupons whose eligibleNodeIds include this product (or are empty), showing code, description and minimum. | I §6.5, R-07 |
| PDP-006 | **Information:** description, material & care, specifications, a size guide link (opens a dialog) when `sizeGuideId` is set, and a **return eligibility** line: "Easy 14-day returns" or "This item is not returnable". | I §6.5, R-17 |
| PDP-007 | **Pincode check:** the customer enters a 6-digit pincode. The response **MUST** be either "Delivery by <date>" plus the delivery-charge rule ("Free delivery on orders above ₹1,999"), or "Sorry, we don't deliver to <pincode> yet". A guest's pincode **MUST** be remembered on the device. A logged-in customer's pincode **MUST** default to their default address. | T-17, R-21 |
| PDP-008 | **Add to Bag:** adds the selected variant with quantity 1. If it's already in the bag, quantity goes up by 1, capped at min(10, available). The control then shows "Go to Bag". If capped, the message is "Only <n> available" or "Maximum 10 per item". | T-27 |
| PDP-009 | **Buy Now:** a guest gets the login prompt (AUTH-020), and after login the action continues. A customer goes to checkout with **only this variant, quantity 1**. The bag is left untouched. | T-28, R-22 |
| PDP-010 | **Wishlist toggle:** adds or removes the product (no size). | T-26 |
| PDP-011 | **Recommendation rails**, each at most 12 products and each omitted when empty:<br>• **Similar:** same subcategory, sellingPrice within ±30%, excluding this product<br>• **Related:** same brand or same section<br>• **Frequently bought together:** a curated list<br>• **Complete the look:** a curated list | T-21, SD-33 |
| PDP-012 | **Stale data:** when Add to Bag or Buy Now is refused because the product or variant is inactive or out of stock, the page **MUST** show the specific message (§13), refresh the product state, and disable the affected control. When the system reports a new price, the page **MUST** show the new price and "Price updated". | R-26 |
| PDP-013 | An inactive product's URL **MUST** show "This product is no longer available" with Similar products, and no purchase controls. | I §6.5 |

### 6.7 Ratings & reviews

| ID | Requirement | Source |
|---|---|---|
| REV-001 | The PDP **MUST** show the average (1 decimal), the total ratings count, and the 5→1 star breakdown as counts and bars, computed from visible reviews. | I §6.6 |
| REV-002 | **Review list:** 10 per page with "Load more". **Sort:** Most recent (default), Highest rating, Lowest rating. **Filter:** star value (1–5) and "With images". | I §6.6, SD-34 |
| REV-003 | **Eligibility:** a customer may create a review for product P only if they have an order line for a variant of P where (a) the order reached **Delivered**, and (b) the line wasn't cancelled. Later returning the item does **not** remove eligibility. | D-12, SD-35 |
| REV-004 | Eligible customers see "Write a review" on the PDP and on the order line. Others don't see the button. If an ineligible customer reaches the form by direct URL, the system **MUST** reject the submission with `REVIEW_NOT_ELIGIBLE`. | D-12 |
| REV-005 | **Review form:** rating is required (1–5). Text is optional (≤ 2,000 characters, trimmed). Up to 5 images (JPEG/PNG/WebP, ≤ 5 MB each). | T-19, R-18 |
| REV-006 | **One review per customer per product.** If one exists, the entry point **MUST** become "Edit your review". | T-19 |
| REV-007 | Before saving, text **MUST** be checked against the configured blocked-word list (whole word, case-insensitive). On a match, the system rejects it with `REVIEW_BLOCKED_CONTENT`, and the customer's input is kept. | T-19 |
| REV-008 | Reviews written by an eligible customer **MUST** be stored with verifiedPurchase = true and show a "Verified Purchase" badge. Seeded reviews have no badge. | R-20 |
| REV-009 | Only the author may edit or delete a review. Editing keeps its existing reports. Deleting removes the review and its images, and updates aggregates. | I §6.6 |
| REV-010 | A logged-in customer may report a review (not their own), once per review. When a review reaches **3 distinct reports**, it **MUST** be hidden, along with its images, from all listings and aggregates. The reporter sees "Thanks, we've received your report." | R-18 |
| REV-011 | Aggregates shown on cards, listings and the PDP **MUST** be identical for the same product at the same time. After a review is created, edited, deleted or hidden, they **MUST** update within 1 minute. | R-20, SD-36 |
| REV-012 | The author can still see their own hidden review, marked "Hidden after reports". | SD-37 |

### 6.8 Accounts, authentication & sessions

| ID | Requirement | Source |
|---|---|---|
| AUTH-001 | **Sign-up fields:** name (required), **email or phone** (one identifier required, the other optional), password, confirm password, security question (from the predefined list), security answer, and an "I am 18 or older" checkbox (required). | D-1, R-11, T-41 |
| AUTH-002 | **Sign-up validation** follows §12. A duplicate email or phone **MUST** be rejected with "An account with this email/phone already exists. Log in instead?" *(This reveals that the identifier is registered. That is an accepted risk under D-42.)* | R-08 |
| AUTH-003 | A successful sign-up **MUST**:<br>• credit the **sign-up grant** of credits (`credits.signupGrant`) as a `signup_grant` ledger entry<br>• log the customer in<br>• merge guest data (AUTH-012)<br>• continue any interrupted action (AUTH-020) | R-22, D-43 |
| AUTH-004 | **Login:** the identifier is an email or phone, plus a password. The system decides the identifier type by format (§12). | D-1 |
| AUTH-005 | Wrong identifier or wrong password **MUST** produce the same message: "Incorrect email/phone or password." | R-12 |
| AUTH-006 | After **5 consecutive** failed logins for an existing account, the account **MUST** be locked for 15 minutes. While it's locked, every login attempt (even with the correct password) **MUST** return "Too many attempts. Try again in <n> minutes." For unknown identifiers, the system **MUST** return the same lockout message after 5 failures from the same client. That keeps responses identical either way. Password reset (AUTH-009) uses the same approach. A successful login resets the counter. | R-12, SD-38 |
| AUTH-007 | **Passwords:** 8–64 characters, at least one letter and one digit. They **MUST** be stored only as a salted, slow one-way hash. Security answers are normalised (lower-cased, outer spaces trimmed, inner whitespace collapsed) and stored the same way. | R-12, R-11 |
| AUTH-008 | **Password reset, step 1:** the customer enters an email or phone. **Step 2:** the customer **chooses their security question from the full predefined list** and types the answer. The system **MUST NOT** show or hint at the account's chosen question. The response to a wrong question, a wrong answer or an unknown identifier **MUST** be the same (`RESET_FAILED`), with the same latency profile. | T-23, D-42 |
| AUTH-009 | **Password reset, step 3:** a correct question and answer allows setting a new password (AUTH-007 rules). After 5 consecutive failed answers for an identifier, it is locked for 15 minutes. While locked, the response is "Too many attempts. Try again in <n> minutes." A successful reset revokes every session for the account and sets `passwordChangeNoticePending`. | T-23, R-11 |
| AUTH-010 | When `passwordChangeNoticePending` is set, the next login **MUST** show "Your password was changed on <date, time>. If this wasn't you, reset it now." and then clear the flag. | R-11 |
| AUTH-011 | **Sessions:** the absolute lifetime is 24 hours and the idle timeout is 60 minutes. There is no "remember me". When an expired session makes a request, the system **MUST** return `SESSION_EXPIRED`. The client **MUST** then show the login dialog **on the current page**. After login, it **MUST** retry the interrupted request and keep the bag. | T-24, SD-22 |
| AUTH-012 | **Merging guest data on login or sign-up:**<br>• **Bag:** for each guest line, if the variant is already in the account bag, quantities are **added together**, capped at min(10, available), with a message for each capped line: "<item>: quantity adjusted to <n>". Otherwise the line is added, subject to the 50-line limit; lines over the limit are not added, with a message. Inactive or out-of-stock guest lines are carried over as-is and flagged in the bag (BAG-005).<br>• **Wishlist:** a union of both, de-duplicated by product.<br>• **Coupon:** the account bag's applied coupon is kept. The guest coupon applies only if the account bag has none.<br>• **Recent searches:** guest terms are merged into the account list (most recent first, at most 10).<br>• Guest device data is then cleared. | D-30, T-57, R-32, SD-39 |
| AUTH-013 | **Logout:** a confirmation dialog ("Log out?" with Cancel and Log out). On confirm, the session is revoked and all account data is removed from the device (cached profile, bag, wishlist, orders). The customer then goes to `/` with an empty guest bag and wishlist. | T-33, R-32 |
| AUTH-014 | A customer's bag and wishlist **MUST** be stored on the server. Changes made on one device **MUST** appear on another device after a reload. | R-32 |
| AUTH-015 | Protected routes (§10.1) opened without a session **MUST** show the login page and then return to the requested route. | I §6.7 |
| AUTH-016 | Auth forms **MUST** validate on blur and on submit, show field-level messages, disable submit while a request is in flight, and announce errors to screen readers. | I §6.7, R-27 |
| AUTH-020 | **Login prompt:** a guest who chooses Buy Now, Proceed to Checkout, Write a review, or a protected route **MUST** see a dialog with "Log in" and "Sign up". After success, the original action **MUST** carry on with the same inputs. Dismissing the dialog leaves the guest where they were. | D-37, R-22 |

### 6.9 Profile & account sections

| ID | Requirement | Source |
|---|---|---|
| PRF-001 | The profile home **MUST** show the name, the email and/or phone, an "Edit Profile" link, and entries for Orders, Wishlist, Gift Cards, Credits, Saved Cards, Saved Addresses, Contact Us and Logout. | I §6.8 |
| PRF-002 | **Edit Profile:** name (required), email, phone, gender (optional: Female, Male, Other, Prefer not to say), date of birth (optional; if given, must mean age ≥ 18). Changing **email, phone, password or security question** **MUST** require the current password. At least one of email and phone **MUST** stay set. A duplicate email or phone **MUST** be rejected: "This email/phone is already linked to another account." | T-25, R-08, SD-40 |
| PRF-003 | **Credits:** shows the balance and the ledger (date, description, +/− amount, linked order), newest first, 20 per page. | I §6.8 |
| PRF-004 | **Gift Cards:**<br>• A "Redeem gift card" form takes a code (case-insensitive).<br>• A valid code creates an AccountGiftCard with balance = faceValue and expiresAt = redeemedAt + validityDays.<br>• Errors: unknown code → "Invalid gift card code". Already redeemed by this account → "You've already redeemed this gift card". Inactive → "This gift card is no longer valid".<br>• The list shows each card's masked code (last 4), balance, status, expiry and its transactions. | R-05, R-31 |
| PRF-005 | **Saved Cards:**<br>• A list of masked cards: network, "•••• 1234", bank, expiry, default badge.<br>• **Add card:** name, number, expiry, CVV. These are validated (§12), and only test card numbers are accepted. The CVV is never stored.<br>• **Remove** asks for confirmation. **Set default** is available.<br>• If the default card is removed, the most recently added remaining card becomes the default.<br>• Expired cards are shown with "Expired" and can't be used for payment. | T-60, SD-10 |
| PRF-006 | **Contact Us:**<br>• FAQs grouped by topic.<br>• A support request form: type (from §4.8), order (optional, own orders only), message (10–1,000 characters).<br>• On submit, the customer sees "Request <SR-number> submitted". Their requests are listed with status "Submitted".<br>• The `account_deletion` type **MUST** show "We've recorded your request. Your account and personal data will be deleted within 30 days." The account is purged at the next daily purge run (PRV-002). | T-37, R-19 |
| PRF-007 | **Orders indicator:** when any of the customer's orders has `hasUnseenUpdate`, a dot **MUST** show on the Profile icon and on the Orders entry. Opening that order clears its flag. | T-13 |

### 6.10 Addresses

| ID | Requirement | Source |
|---|---|---|
| ADDR-001 | "Add address" **MUST** open the map step: a place search box, a map with a draggable pin, and "Use my current location" (which asks for browser location permission). Moving the pin **MUST** reverse-geocode it and prefill city, state, pincode and street/area where available. | I §6.9 |
| ADDR-002 | **Details step:** recipient name (default: profile name), recipient phone (default: account phone), house/flat (required), building, street/area (required), landmark (optional), city (required), state (required, from the list of Indian states and UTs), pincode (required), and label (Home, Work, or Other with custom text). The details step **MUST** show a small static map of the chosen pin. | I §6.9, SD-08 |
| ADDR-003 | An "Enter address manually" link **MUST** be visible on the map step at all times. If the map fails to load within 10 s, place search errors, or location is denied, the manual details step **MUST** be offered with the message "Map unavailable — enter your address manually." Manual addresses have no coordinates. | R-23, T-42 |
| ADDR-004 | On save, the system **MUST** validate the fields (§12) and set `serviceable` from the pincode list. If the pincode isn't serviceable, it saves the address and shows "We don't deliver to <pincode> yet. You can save this address, but it can't be used for delivery." | R-24 |
| ADDR-005 | **Edit** reopens both steps with the current values, and the pin can be moved. **Delete** asks for confirmation. Deleting the default address makes the most recently added remaining address the default. | I §6.9, SD-09 |
| ADDR-006 | The first saved address becomes the default automatically. "Set as default" makes exactly one address the default. | I §6.9 |
| ADDR-007 | Orders store an **address snapshot**. Editing or deleting an address never changes existing orders. | SD-41 |
| ADDR-008 | The same add and edit flow **MUST** be usable from Saved Addresses, the bag's "Change address" and checkout's address step. Saving from the bag or checkout selects that address for delivery. | I §6.9 |
| ADDR-009 | Accounts are limited to 10 addresses. At the limit, "Add address" shows "You can save up to 10 addresses. Delete one to add another." | SD-08 |

### 6.11 Wishlist

| ID | Requirement | Source |
|---|---|---|
| WSH-001 | The wishlist page **MUST** list wishlisted products as cards (PLP-011), with Remove and Move to Bag. Products that are inactive or out of stock **MUST** show "Unavailable" or "Out of stock" and have Move to Bag disabled. | I §6.8 |
| WSH-002 | **Move to Bag:** if the product has more than one available variant, a size picker **MUST** open, showing only sizes with available > 0. When a size is chosen (or the product has only one variant), the variant is added (PDP-008 rules) and the product **MUST** be removed from the wishlist. | T-26 |
| WSH-003 | A guest's wishlist is stored on the device and works the same way. | D-30 |
| WSH-004 | The wishlist has no size limit. The page **MUST** paginate 24 at a time. | R-32, SD-23 |

### 6.12 Bag

| ID | Requirement | Source |
|---|---|---|
| BAG-001 | **Each line shows:** image, brand, name, size, sellingPrice × quantity, the struck-through mrp, discount %, a quantity selector (1 to min(10, available)), Remove, and Move to Wishlist. | I §6.10 |
| BAG-002 | Changing a quantity **MUST** request a new quote. If the requested quantity is more than available, the system sets it to `available` and shows "Only <n> available". | T-27 |
| BAG-003 | **Remove** takes the line out of the bag, with a 5-second "Undo". **Move to Wishlist** removes the line and adds the product to the wishlist. For a guest, both happen on the device. | I §6.10, SD-42 |
| BAG-004 | Opening the bag **MUST** fetch a fresh quote. This compares each line's current sellingPrice with `lastSeenUnitPrice`. If they differ, the line shows "Price changed from ₹X to ₹Y", and `lastSeenUnitPrice` is then updated. | I §6.10 |
| BAG-005 | **Line problems:** each line with a problem **MUST** be flagged with a specific message and fix action:<br>• product inactive → "No longer available" — action: Remove<br>• variant out of stock → "Out of stock" — actions: Remove, Move to Wishlist<br>• quantity above available → "Only <n> left" — action: adjust<br>Proceed to Checkout **MUST** stay disabled while any flagged problem remains. | I §6.10 |
| BAG-006 | **Coupon:**<br>• One code input with Apply.<br>• Results: unknown → `COUPON_INVALID`. Outside its validity → `COUPON_EXPIRED`. Below its minimum, no eligible items, or the per-customer limit reached → `COUPON_NOT_ELIGIBLE`, with the specific reason (§13).<br>• An applied coupon shows its code, the saving and Remove.<br>• "View available coupons" lists the active coupons with their eligibility status.<br>• For guests, the per-customer limit is checked after login. | R-25 |
| BAG-007 | If a bag change makes the applied coupon ineligible, the next quote **MUST** remove it and show "Coupon <CODE> removed: <reason>". | R-25 |
| BAG-008 | **Bank-offer preview:** if any line is bankOfferEligible and the offer's minimum would be met, show "Pay with an HDFC card and save up to ₹<X>", where X is the offer computed as in PRC-006. Otherwise show the offer with its minimum ("on eligible items above ₹2,500"). | R-07 |
| BAG-009 | **Price summary**, all from the quote:<br>• Total MRP<br>• Discount on MRP<br>• Coupon discount<br>• Delivery charge ("FREE" when it's waived)<br>• **Total amount**<br>• a line "Inclusive of ₹<tax> tax"<br>When the delivery charge applies, show "Add items worth ₹<n> more for FREE delivery". | D-36, D-27 |
| BAG-010 | **Delivery details:** a customer sees their default address (or the selected one) with "Change", and "Delivery by <date>". A guest sees their remembered pincode with "Delivery by <date>" and "Change", or a prompt to enter a pincode. An unserviceable pincode shows "We don't deliver to <pincode> yet". | R-21 |
| BAG-011 | **Proceed to Checkout:**<br>1. A guest gets the login prompt (AUTH-020).<br>2. If the customer has an Awaiting Payment order, show the pending-order dialog (CHK-010).<br>3. The system re-validates (CHK-002).<br>4. On success, go to checkout. On changes, show the change summary in the bag. | D-37, R-09 |
| BAG-012 | **Empty bag:** "Your bag is empty" with a Continue Shopping button that goes to `/`. If the wishlist isn't empty, a "View wishlist" link is also shown. | I §6.10 |
| BAG-013 | A guest bag **MUST** survive browser restarts for 30 days after its last update. A customer's bag survives indefinitely. | T-57 |

### 6.13 Pricing engine (business rules)

All amounts are computed by the system in paise. A **quote** is the complete output of these rules. [INT-001]

| ID | Rule | Source |
|---|---|---|
| PRC-001 | **Line values:** lineMrp = mrp × qty; lineValue = sellingPrice × qty. **Bag value** = Σ lineValue. **Discount on MRP** = Σ(lineMrp − lineValue). | I §6.10 |
| PRC-002 | **Coupon base** = Σ lineValue of lines that the coupon's eligibleNodeIds include (all lines when the list is empty). The coupon is eligible only if: it is active; now is within validFrom–validTo; base ≥ minEligibleValue; and the customer's count of **Placed or later** orders using the code is below perCustomerLimit. | R-25 |
| PRC-003 | **Coupon discount:** percent → min(round(base × value / 100), maxDiscount). Flat → min(value, base). Rounding is to the **nearest whole rupee**, half up. | R-25, SD-43 |
| PRC-004 | **Pro-rating:** an order-level discount is shared across its eligible lines in proportion to lineValue. Shares are in paise, using the **largest-remainder method**, so the shares always add up exactly to the discount. Ties go to the earliest line. | R-04, SD-43 |
| PRC-005 | **Delivery charge** = 0 if (bag value − coupon discount) > ₹1,999. Otherwise it's `delivery.flatCharge`. The bank offer, credits and gift cards don't affect this test. | D-27, T-16 |
| PRC-006 | **Bank offer:** it applies only when the payment remainder (PRC-008) is paid by a card whose issuingBank is HDFC Bank and whose type is in the offer's cardTypes. Offer base = Σ (lineValue − couponShare) over bankOfferEligible lines. Eligible if base ≥ minEligibleValue and the offer is active and within its dates. Discount = min(round(base × percent / 100), maxDiscount), pro-rated by PRC-004. | R-07, T-18 |
| PRC-007 | **Order total** = bag value − coupon discount − bank-offer discount + delivery charge. | T-18 |
| PRC-008 | **Wallet application**, done after PRC-007:<br>1. The selected gift card covers g = min(gift card balance, total).<br>2. If "Use credits" is on, credits cover c = min(credit balance, total − g).<br>3. **Remainder** r = total − g − c.<br>If r = 0, no card, UPI or COD may be selected. | R-06, SD-44 |
| PRC-009 | **Bank offer and wallet together:** the bank offer is computed first, assuming the selected HDFC card pays the remainder. If g + c ≥ the total *with* the offer, no card is used, so the offer **MUST NOT** apply, and the quote is recomputed without it. | R-06, R-07, SD-44 |
| PRC-010 | **Tax portion** (for information) = Σ over lines of (lineValue − couponShare − bankOfferShare) × rate / (100 + rate), using the line's TaxRate, plus the delivery charge × 18 / 118. Each term is rounded half up to paise, then the terms are summed. It **MUST NOT** change the total. | D-36, R-35, SD-17 |
| PRC-011 | **COD** is allowed only when 0 < r ≤ `cod.maxPayable`. | T-59 |
| PRC-012 | Every quote **MUST** include: lines with their shares, all summary amounts, coupon status and reason, bank-offer status and reason, delivery charge, tax portion, wallet application, the remainder, and the allowed remainder methods. | INT-001 |

### 6.14 Checkout

| ID | Requirement | Source |
|---|---|---|
| CHK-001 | Checkout **MUST** need an authenticated session. It has three steps — **Address → Summary → Payment** — with a step indicator. Back navigation between steps keeps the customer's inputs. | D-37 |
| CHK-002 | **Re-validation at checkout start** for every line: active, available ≥ quantity, and the current price. It also checks coupon eligibility and the quote. Every change **MUST** be listed for the customer with the before and after values: removed items, reduced quantities, price changes, a removed coupon, and changes to the delivery charge. The customer must acknowledge the list ("Continue with these changes") before they can go on. | I §6.11 |
| CHK-003 | **Phone:** if the account has no phone number, the Address step **MUST** ask for one (§12). On submit:<br>• If the number is free, it is saved to the account.<br>• If it belongs to another account, it is **not** saved. The customer sees "This number can't be added to your account. We'll use it as the contact number for this order only." and the number becomes the order's contactPhone. | D-23, D-31, R-08 |
| CHK-004 | **Address step:** saved addresses are listed, with the default preselected. Unserviceable addresses are shown but can't be selected ("Not deliverable"). "Add new address" opens ADDR-001. Continuing **MUST** need a selected, serviceable address. "Delivery by <date>" is shown for each serviceable address. | I §6.11, R-24 |
| CHK-005 | **Summary step:** items (image, name, size, quantity, line amount), the coupon (which can be changed or removed here), the price summary (BAG-009) and the delivery address with "Change". | I §6.11 |
| CHK-006 | **Buy Now checkout** **MUST** use only the Buy Now item (quantity can be changed, 1–10). It **MUST** ignore the bag's lines and coupon. A coupon may be applied separately. | T-28, SD-45 |
| CHK-007 | Checkout state for the current attempt (step, selected address, coupon) **MUST** survive a session expiry and re-login (AUTH-011). | T-24 |
| CHK-010 | **Pending order:** if the customer has an Awaiting Payment order when checkout starts (from the bag or Buy Now), a dialog **MUST** show that order's number, amount and remaining retry time, with **Retry payment** (goes to that order's payment step) and **Cancel pending order** (CNL-002, then continue to the new checkout). A second Awaiting Payment order **MUST NOT** be created. | R-09 |

### 6.15 Payment

| ID | Requirement | Source |
|---|---|---|
| PAY-001 | **The payment step shows:**<br>(1) the demo warning **"This is a demo — do not enter real card details."** above the payment options<br>(2) gift card: choose one active, unexpired redeemed card with a balance > 0, or none; plus "Redeem a code" inline (PRF-004)<br>(3) a "Use credits (₹<balance> available)" toggle<br>(4) the remainder methods: **Card**, **UPI**, **Cash on Delivery**<br>(5) the final amount summary from the quote | D-25, D-32, D-33, R-06 |
| PAY-002 | Every change to the gift card, credits, method or card selection **MUST** request a new quote. The **Pay** button **MUST** show the exact final remainder ("Pay ₹<r>", "Place order (pay ₹<r> on delivery)", or "Place order" when r = 0). | I §6.11 |
| PAY-003 | **Card:** pick a saved, unexpired card (CVV required each time), or "Add new card" (name, number, expiry, CVV, with an optional "Save this card"). The card number **MUST** be a designated test card (§5 / seed data). Other numbers that pass format checks are rejected with "Use a demo test card. Real cards aren't accepted." | D-29, D-33, T-60 |
| PAY-004 | **UPI:** a UPI ID in the format `<handle>@<psp>` (§12). Designated test UPI IDs force their outcomes. Any other valid-format UPI ID gets a random outcome. | D-34, R-10, SD-46 |
| PAY-005 | **COD** is offered only when PRC-011 allows it. Otherwise it appears disabled, with "Cash on Delivery is available for amounts up to ₹10,000". | T-59 |
| PAY-006 | **Pay is atomic** [INT-002]. The system **MUST**, in one transaction:<br>(a) re-quote and compare with the quote the client showed — if they differ, reject with `QUOTE_CHANGED` and the change list, and change nothing<br>(b) check stock for every line<br>(c) create the Order in **Awaiting Payment**, with lines, price snapshot, address snapshot, contact phone and order number<br>(d) place stock holds<br>(e) reserve the gift-card and credit amounts (allocations `reserved`, with debit entries)<br>(f) create a PaymentAttempt | D-39, I §7.2 |
| PAY-007 | **Idempotency:** each Pay or Retry request carries a client-generated idempotency key. A repeated request with the same key **MUST** return the original result without creating another order or attempt. | I §7.4 |
| PAY-008 | **Remainder handling after PAY-006:**<br>• r = 0 → the order goes to **Placed** at once, and the wallet allocations become `captured`.<br>• COD → **Placed**, with the COD allocation `cod_due`.<br>• Card or UPI → the Payment simulator returns an outcome. Designated test values force their outcome. Otherwise it is random by `sim.paymentOutcomeWeights`. The simulator **MUST** show a "Processing payment…" state for 2–4 seconds. | D-34, D-39, R-06 |
| PAY-009 | **Success** → the order becomes **Placed**, allocations `captured`, holds committed (INV-002). For a bag checkout, the purchased lines are removed from the bag. A Buy Now checkout leaves the bag alone. The customer sees the confirmation page (PAY-013). | D-39 |
| PAY-010 | **Failure, cancelled or timed out** → the order stays **Awaiting Payment**. The customer sees a specific message:<br>• failure: "Payment failed. No money was taken."<br>• cancelled: "Payment cancelled."<br>• timed out: "Payment timed out. No money was taken."<br>Each comes with **Retry payment** and the remaining retry time. Holds and reservations are kept. The bag is unchanged. | D-34, D-39 |
| PAY-011 | **Retry** (from that message, Orders, or CHK-010) opens the order's payment step with **locked items and prices**. The customer may change the method, card, UPI ID, gift card or credits. A new quote is computed on the locked lines, and the bank offer is recomputed for the newly chosen card. Each retry creates a new PaymentAttempt. At most one attempt may be pending at a time; a concurrent one returns `PAYMENT_IN_PROGRESS`. | D-39, R-07 |
| PAY-012 | When the retry window (15 min after order creation) ends without success, the scheduler **MUST**: set the order to **Failed**, release the stock holds, reverse the wallet reservations (`order_debit_reversal`), and set `hasUnseenUpdate`. | D-39 |
| PAY-013 | **Confirmation page:** order number, items, delivery address, "Delivery by <date>", and the amounts: paid online, via gift card and via credits, plus "Pay ₹<n> on delivery" for COD. It links to the order details and to Continue Shopping. | I §6.11 |
| PAY-014 | **Saving a card:** if "Save this card" was ticked, the card is saved (masked) only after the attempt reaches a final outcome. It is saved even if the outcome is a failure. | SD-47 |
| PAY-015 | A logged-in customer may open the payment step of an order only while it's Awaiting Payment and inside the window. Otherwise they get "This order can no longer be paid" and a link to the order. | D-39 |

### 6.16 Orders & fulfilment simulation

| ID | Requirement | Source |
|---|---|---|
| ORD-001 | **Order number** format: `ORD-<YYMMDD>-<5 random uppercase alphanumerics>`, unique. | SD-48 |
| ORD-002 | **Orders list:** the customer's own orders (except Awaiting Payment orders whose window has expired, which show as Failed), newest first, 10 per page. Each shows the number, date, headline status (ORD-006), the first item's image with "+n more", and the total. | I §6.12 |
| ORD-003 | **Order details:** the number, date, contact phone, address snapshot, payment breakdown (methods and amounts, masked card or UPI, COD status), the lines (with after-sale state and actions), the status timeline (OrderStatusEvents with timestamps), tracking (courier name and tracking ID, from Shipped onwards), the delivery OTP section (DLV-001), the invoice (INV-001), and refunds (each with amount, destinations and status). | I §6.12 |
| ORD-004 | **Automatic progression:** the scheduler **MUST** advance Placed → Confirmed → Packed → Shipped → Out for Delivery, one step per `sim.statusStepInterval`, measured from the previous transition. Each transition writes an OrderStatusEvent and sets `hasUnseenUpdate`. At Shipped, a simulated courier name and tracking ID are assigned. | D-35, T-61, T-14 |
| ORD-005 | **Expected delivery date** = placedAt + the zone's deliveryDays, as a calendar date. *Because statuses advance in minutes, the order usually arrives before this date. That is accepted for the showcase.* | T-17, SD-49 |
| ORD-006 | **Headline status** = the order status. When some lines have after-sale states, a suffix is added, for example "Delivered · 1 item returned" or "Packed · 1 item cancelled". | R-03 |
| ORD-007 | Every order operation (view, cancel, return, simulator, retry, invoice) **MUST** enforce AUTHZ-001/002. | I §7.3 |

### 6.17 Delivery OTP & Delivery simulator

| ID | Requirement | Source |
|---|---|---|
| DLV-001 | Every order **MUST** have a random 4-digit delivery OTP, generated at Placed. It is shown in the order details from **Out for Delivery** onwards, with the text "Share this OTP with the delivery person to receive your order." | D-38, D-41, SD-50 |
| DLV-002 | While the order is Out for Delivery, the order page **MUST** show a visually distinct panel titled **"Delivery simulator (demo)"**. It has an OTP input with "Confirm delivery", and "Customer rejected parcel". | D-41 |
| DLV-003 | **Correct OTP** → the order becomes **Delivered**. deliveredAt is set, each returnable line gets returnWindowEndsAt = deliveredAt + 14 days, review eligibility starts (REV-003), the COD allocation becomes `cod_collected`, and the invoice remains available. | D-38, D-41 |
| DLV-004 | **Wrong OTP** → "Incorrect OTP". After 5 wrong entries in one attempt, the panel locks for the rest of that attempt with "Too many incorrect OTPs. Delivery will be re-attempted." The attempt then ends as if the window had expired (DLV-006). | SD-51 |
| DLV-005 | **Customer rejected parcel** asks for confirmation first. The order then becomes **Rejected at Delivery**, all active lines are restocked (INV-004), and a refund is created for the whole order (RFD-003). The amount payable on delivery for COD becomes ₹0. | D-41, R-04 |
| DLV-006 | If the handover window (10 min) ends with no confirmation or rejection: on attempt 1, the order becomes **Delivery Attempt Failed**. After one `sim.statusStepInterval`, it goes back to **Out for Delivery** (attempt 2), with the **same OTP**. If attempt 2 also ends unconfirmed, the order becomes **Returned to Origin**, the lines are restocked, and a whole-order refund is created. | D-41, SD-50 |

### 6.18 Cancellation

| ID | Requirement | Source |
|---|---|---|
| CNL-001 | A line can be cancelled when the order is Placed, Confirmed or Packed and the line is `active`. Cancellation is for the **whole line**. On Shipped and later statuses, the Cancel action **MUST** be hidden, and if called it **MUST** be rejected with `ACTION_NOT_ALLOWED`. | R-14, SD-52 |
| CNL-002 | **An Awaiting Payment order is cancelled as a whole.** The order becomes **Cancelled**, stock holds are released, wallet reservations are reversed, and there's no refund because nothing was captured. | R-09, R-14, SD-52 |
| CNL-003 | **Cancel flow:**<br>1. Choose the line.<br>2. Choose a reason (from the list) and optionally a comment.<br>3. Review: the item, and the refund amount and destinations from RFD-001/002.<br>4. Confirm.<br>The line becomes `cancelled`, its stock is restocked, and a refund is created if anything was captured. | I §6.13 |
| CNL-004 | When every line of an order is cancelled, the order **MUST** become **Cancelled**, and the delivery charge **MUST** be added to the refund created by that final cancellation. | R-04 |
| CNL-005 | **Cancellation reasons:** Ordered by mistake; Found a better price; Delivery time too long; Changed my mind; Other. | SD-53 |

### 6.19 Returns

| ID | Requirement | Source |
|---|---|---|
| RET-001 | A line is **returnable** when: the order is Delivered, the line isn't cancelled, product.returnable = true, now < returnWindowEndsAt, and the returnable quantity (quantity − units already in non-rejected, non-closed returns) is > 0. A non-returnable line **MUST** show "Not returnable". A line past its window **MUST** show "Return window closed on <date>". | T-8, R-17 |
| RET-002 | **Return flow:**<br>1. Choose a quantity (1 to the returnable quantity).<br>2. Choose a reason: Size too small; Size too large; Defective/damaged; Not as described; Received wrong item; Quality not as expected; Other.<br>3. Optionally add a comment (≤ 500 characters).<br>4. Review: the item, the pickup address (the order's address snapshot) and the estimated refund (RFD-001/002).<br>5. Submit.<br>This creates a ReturnRequest in **Return Requested**. | I §6.13, SD-54 |
| RET-003 | **Return progression** (§7.3), one step per `sim.statusStepInterval`:<br>Requested → Approved or Rejected (by weights, or forced) → Pickup Scheduled → Picked Up or Pickup Failed.<br>Pickup Failed → Pickup Scheduled (retry, attempt 2). A second failure → **Return Closed**.<br>Picked Up → Refund Initiated → Refunded. | D-35, R-13 |
| RET-004 | A **Return Rejected** request **MUST** show a reason, chosen at random from: "Item shows signs of use", "Tags or packaging missing", "Item doesn't match our records". A rejected request **MUST NOT** be resubmittable for the same units. The returnable quantity stays reduced by those units. | R-13, SD-55 |
| RET-005 | **Return Closed** **MUST** show "Pickup couldn't be completed after 2 attempts. Your return has been closed." The units count as not returnable. | R-13, SD-55 |
| RET-006 | **Deterministic test overrides:** a return whose comment contains `#approve`, `#reject` or `#pickupfail` **MUST** force that outcome. This is documented on the demo help page. | R-10, SD-56 |
| RET-007 | At **Picked Up**, the returned units **MUST** be restocked, and a refund is created for those units (RFD-001). | R-16, R-15 |

### 6.20 Refunds

| ID | Rule | Source |
|---|---|---|
| RFD-001 | **Refund amount for units:** for a line, the per-unit paid share = lineNetPaid / quantity. Paise remainders go to the last unit. For k units, the refund = the sum of the per-unit shares of those units. | R-04 |
| RFD-002 | **Refund destinations:** allocate the refund amount across the order's captured allocations, in this order:<br>1. card/UPI<br>2. gift card<br>3. credits<br>Each is capped at its captured amount minus what's already been refunded to it. For COD orders, the amount **collected** on delivery is refunded to **credits** (as `refund_credit`), after the gift card and credit portions. A COD amount that was never collected (cancelled or rejected before delivery) is not refunded; it is simply no longer due. | R-04, T-11 |
| RFD-003 | **Whole-order refunds** (all lines cancelled, Rejected at Delivery, Returned to Origin) **MUST** include the delivery charge. Partial refunds **MUST NOT** include it, and **MUST NOT** deduct a delivery charge when the remaining items fall below the threshold. | R-04 |
| RFD-004 | **Gift-card destination:** if the AccountGiftCard is still active and unexpired, the amount is credited back to it. If it has expired, the amount goes to credits, with the note "Gift card expired — refunded as credits". | R-05 |
| RFD-005 | **Refund timing:** a refund is created in **Refund Initiated** when the cancellation is confirmed, at Picked Up, at Rejected at Delivery, or at Returned to Origin. It becomes **Refunded** after one `sim.statusStepInterval`. Credit and gift-card destinations get their ledger entries at Refunded. Card and UPI refunds are display-only. | R-15 |
| RFD-006 | **Refund display:** each refund shows the amount, the destination breakdown (for example "₹1,200 to Visa •••• 1111, ₹300 to Credits"), the status with timestamps, and the trigger. | I §6.13 |
| RFD-007 | The sum of all refunds for an order **MUST NEVER** exceed the order total captured plus collected. | I §7.4 |

### 6.21 Inventory

| ID | Rule | Source |
|---|---|---|
| INV-001 | **Hold:** at PAY-006, held += quantity for each line, inside the same transaction as the stock check. If available < quantity, Pay **MUST** fail with `OUT_OF_STOCK` listing the affected lines, and nothing persists. | T-48 |
| INV-002 | **Commit:** at Placed, for each line: onHand −= quantity and held −= quantity. | T-48 |
| INV-003 | **Release:** when an Awaiting Payment order becomes Failed or Cancelled, held −= quantity. | T-48 |
| INV-004 | **Restock:** onHand += quantity for each cancelled line, every active line of a Rejected at Delivery or Returned to Origin order, and the returned units at Picked Up. | R-16 |
| INV-005 | **Demo reset:** daily at 03:00 IST, for every variant: onHand = max(onHand, baselineOnHand), and only for variants with held = 0. Variants that are out of stock by seed design (baselineOnHand = 0) stay out of stock. | R-16, SD-21 |
| INV-006 | Two customers paying at the same moment for the last unit **MUST** never both succeed in placing a hold. | I §7.4 |

### 6.22 Invoice

| ID | Requirement | Source |
|---|---|---|
| INV-I-001 | An invoice **MUST** be available from **Shipped** onwards. It is not available for orders that are Failed, Cancelled before shipping, Rejected at Delivery, or Returned to Origin. | T-15, SD-57 |
| INV-I-002 | **Invoice content:**<br>• the header **"Sample invoice — not a tax document"**<br>• the sample company details<br>• the invoice number and date, and the order number<br>• the billing and shipping address<br>• each line: name, size, quantity, unit price, discounts, net amount, tax rate and the tax portion included<br>• the delivery charge<br>• the total<br>• the payment methods and amounts | R-35 |
| INV-I-003 | The customer can view the invoice on screen and download it as a PDF. Cancellations and returns don't change the invoice; refunds are shown in the order details. | T-15, SD-57 |

## 7. State machines

A transition that isn't listed here **MUST** be rejected with `ACTION_NOT_ALLOWED`. Every transition writes an event with its actor.

### 7.1 Order status
| From | Event | To | Actor | Side effects |
|---|---|---|---|---|
| — | Pay accepted (PAY-006) | AWAITING_PAYMENT | customer | holds, reservations |
| — | Pay accepted with r = 0, or COD | PLACED (passing through AWAITING_PAYMENT) | customer | commit stock; capture wallet; COD `cod_due`; OTP generated |
| AWAITING_PAYMENT | attempt success | PLACED | system | commit, capture, OTP generated, bag lines removed (bag source only) |
| AWAITING_PAYMENT | retry window expires | FAILED | scheduler | release holds, reverse reservations |
| AWAITING_PAYMENT | customer cancels | CANCELLED | customer | release holds, reverse reservations |
| PLACED | step timer | CONFIRMED | scheduler | |
| CONFIRMED | step timer | PACKED | scheduler | |
| PACKED | step timer | SHIPPED | scheduler | courier name and tracking ID assigned; invoice available |
| SHIPPED | step timer | OUT_FOR_DELIVERY (attempt 1) | scheduler | OTP shown; simulator enabled |
| PLACED / CONFIRMED / PACKED | last active line cancelled | CANCELLED | customer | refund including delivery charge |
| OUT_FOR_DELIVERY | correct OTP | DELIVERED | delivery_simulator | return windows set; reviews unlocked; COD collected |
| OUT_FOR_DELIVERY | parcel rejected | REJECTED_AT_DELIVERY | delivery_simulator | restock; whole-order refund |
| OUT_FOR_DELIVERY (attempt 1) | window expires or OTP lockout | DELIVERY_ATTEMPT_FAILED | scheduler | |
| DELIVERY_ATTEMPT_FAILED | step timer | OUT_FOR_DELIVERY (attempt 2) | scheduler | same OTP |
| OUT_FOR_DELIVERY (attempt 2) | window expires or OTP lockout | RETURNED_TO_ORIGIN | scheduler | restock; whole-order refund |

**Terminal states:** DELIVERED (after-sale actions continue at line level), FAILED, CANCELLED, REJECTED_AT_DELIVERY, RETURNED_TO_ORIGIN.

### 7.2 Order line
| From | Event | To |
|---|---|---|
| active | customer cancels (order PLACED, CONFIRMED or PACKED) | cancelled |

Returns live on ReturnRequest (§7.3). One line may have several ReturnRequests for different units.

### 7.3 Return request
| From | Event | To | Notes |
|---|---|---|---|
| — | customer submits | RETURN_REQUESTED | |
| RETURN_REQUESTED | step timer, approve | RETURN_APPROVED | by weights, or forced by `#approve` |
| RETURN_REQUESTED | step timer, reject | RETURN_REJECTED | terminal; reason shown |
| RETURN_APPROVED | step timer | PICKUP_SCHEDULED (attempt 1) | pickup address = order address snapshot |
| PICKUP_SCHEDULED | step timer, success | PICKED_UP | restock; refund created |
| PICKUP_SCHEDULED (attempt 1) | step timer, fail | PICKUP_FAILED | forced by `#pickupfail` |
| PICKUP_FAILED | step timer | PICKUP_SCHEDULED (attempt 2) | |
| PICKUP_SCHEDULED (attempt 2) | step timer, fail | RETURN_CLOSED | terminal |
| PICKED_UP | refund created | REFUND_INITIATED | mirrors the Refund status |
| REFUND_INITIATED | step timer | REFUNDED | terminal |

The customer **MUST NOT** be able to cancel a return request in V1. [SD-58]

### 7.4 Payment attempt
`PENDING → SUCCESS | FAILURE | CANCELLED | TIMED_OUT`. All four outcomes are final. A new attempt is a new record.

### 7.5 Refund
`REFUND_INITIATED → REFUNDED` (after one step).

### 7.6 Account gift card
`ACTIVE → EXHAUSTED` (balance reaches 0, and becomes ACTIVE again if a refund credits it) · `ACTIVE/EXHAUSTED → EXPIRED` (when now ≥ expiresAt; this is final).

### 7.7 Review
`VISIBLE → HIDDEN` (3rd distinct report) · `VISIBLE/HIDDEN → deleted` (by the author).

### 7.8 Account lock
`UNLOCKED → LOCKED` (5th consecutive failure) · `LOCKED → UNLOCKED` (15 minutes pass). The same model applies separately to login and to password reset.

## 8. Key user flows

Each flow lists its main path and its required error branches. A flow is acceptance-tested end to end.

**UF-01 Discover → Bag (guest)**
1. On the landing page, the guest chooses a Shop by Category card, which opens the listing.
2. They apply filters and sort; the URL updates.
3. They open a product and select a size.
4. Add to Bag; the count updates.
- *Branches:* the size isn't selected (PDP-004); the variant has sold out since the page loaded (PDP-012).

**UF-02 Search** — type at least 2 characters → suggestions → Enter → results → filter → product.
- *Branches:* a typo still finds the product (SRC-004); zero results (SRC-007).

**UF-03 Guest → login at checkout**
1. The guest has a bag with 2 lines.
2. Proceed to Checkout → login prompt → log in.
3. The bags merge (AUTH-012), with messages.
4. Re-validation passes, and the Address step opens.
- *Branch:* sign-up instead of login → the same continuation.

**UF-04 Checkout with card success**
1. Address (and phone, if missing) → Summary → Payment.
2. Choose an HDFC test card, so the offer applies and the amount updates.
3. Pay → success → confirmation page.
4. The purchased lines leave the bag, and the order appears as Placed.

**UF-05 Payment failure and retry**
1. Pay with a test card that forces failure → the message and Retry.
2. Leave, then return via Proceed to Checkout → the pending-order dialog → Retry.
3. Change to UPI → success → Placed.
- *Branch:* no retry within 15 minutes → Failed, stock released, wallet reversed.

**UF-06 Wallet-only payment** — redeem a demo gift card, turn on credits, and r becomes 0 → "Place order" → Placed with no simulator.

**UF-07 COD to delivery**
1. COD order → Placed → … → Out for Delivery.
2. The OTP appears; enter it in the Delivery simulator → Delivered.
3. Reviews are unlocked, and returns are available on returnable lines.

**UF-08 Rejected at delivery (prepaid)** — the simulator's "Customer rejected parcel" → Rejected at Delivery → a refund of the whole order, including delivery, goes to the original methods.

**UF-09 Missed handover** — no action for 10 minutes → Delivery Attempt Failed → Out for Delivery again → no action → Returned to Origin → refund.

**UF-10 Partial cancellation**
1. In a 3-line Packed order, cancel line 2 → see its pro-rated refund → confirm → Refund Initiated → Refunded.
2. Cancel the remaining lines → the order is Cancelled, and the delivery charge is refunded with the last one.

**UF-11 Return**
1. On a Delivered order, return 1 of 2 units with the comment `#approve`.
2. Requested → Approved → Pickup Scheduled → Picked Up → Refund Initiated → Refunded, all within about 10 minutes.
- *Branches:* `#reject` (with reason), `#pickupfail` twice (Return Closed).

**UF-12 Review**
1. After Delivered, Write a review → submit a rating, text and 2 images → Verified Purchase badge.
2. The aggregates update on the PDP and card.
- *Branches:* a blocked word, or an ineligible customer.

**UF-13 Password reset** — identifier → choose question from list + answer → new password → sessions revoked → next login shows the notice.
- *Branch:* 5 wrong answers → lockout.

**UF-14 Address via map failure** — map load error → manual entry → unserviceable pincode → saved but not selectable in checkout.

**UF-15 Session expiry mid-checkout** — the session expires on the Summary step → the login dialog → log in → back to Summary with its state kept (CHK-007).

## 9. Frontend behaviour & non-functional requirements

| ID | Requirement | Source |
|---|---|---|
| FE-001 | **Breakpoints:** mobile < 768 px, tablet 768–1023 px, desktop ≥ 1024 px. Layouts **MUST** be verified at 360, 768, 1024 and 1280 px, with no horizontal page scroll. | R-27 |
| FE-002 | The client **MUST NOT** compute authoritative amounts, eligibility or status. It shows the values the system returns. Optimistic UI is allowed only for the wishlist toggle and bag quantity, and it **MUST** reconcile with the system's response. | I §7.1 |
| FE-003 | **Guest device storage:** bag, wishlist, recent searches and remembered pincode. Each **MUST** carry a lastUpdatedAt and be discarded after 30 days. If storage is unavailable, the guest bag and wishlist **MUST** still work for the current tab, and the customer **MUST** see "Your bag can't be saved on this device". | T-57, SD-59 |
| FE-004 | **Accessibility (WCAG 2.1 AA):**<br>• every interactive element is reachable and operable by keyboard, with a visible focus indicator<br>• dialogs and drawers trap focus and restore it on close<br>• images have alt text (decorative ones are empty)<br>• contrast is ≥ 4.5:1 for text and ≥ 3:1 for UI components<br>• form errors are linked to their fields and announced<br>• the carousel can be paused<br>• touch targets are ≥ 44 × 44 px on mobile | R-27 |
| FE-005 | **Browsers:** the latest 2 major versions of Chrome, Safari (macOS and iOS), Firefox and Edge. | R-27 |
| FE-006 | **Performance (75th percentile, mid-range mobile on 4G):** LCP < 2.5 s, INP < 200 ms, CLS < 0.1 on the landing page, PLP, PDP and bag. Images below the fold **MUST** load lazily, and image dimensions **MUST** be reserved to avoid layout shift. | R-28 |
| FE-007 | **Pages have unique titles:** `<Product name> – <Brand>`, `<Node name> – Shop`, `Search: <term>`, and so on. Each route has a canonical URL. | SD-60 |
| FE-008 | Every customer-facing amount **MUST** use the money format in §0. | SD-01 |

**Security & privacy requirements:**

| ID | Requirement | Source |
|---|---|---|
| SEC-001 | All traffic **MUST** be over HTTPS. Session tokens **MUST NOT** be readable by page scripts, and requests that change data **MUST** be protected against cross-site request forgery. | I §7.3 |
| SEC-002 | Passwords and security answers are stored as salted, slow hashes (AUTH-007). They **MUST NOT** be logged or returned by any operation. | R-11 |
| SEC-003 | Full card numbers and CVVs **MUST NOT** be stored, logged or sent to anything other than the payment simulator in the same request. | T-60 |
| SEC-004 | Rate limits: login, sign-up, password reset, coupon apply and gift-card redeem **MUST** be limited per client. The proposal is 20 requests a minute; going over returns `RATE_LIMITED`. | SD-61 |
| SEC-005 | Uploaded review images **MUST** be checked for allowed type by content (not just the file extension) and for size. Metadata (EXIF location) **MUST** be removed before storage. | R-18, SD-62 |
| SEC-006 | IDs exposed in URLs or the API for orders, addresses, returns and so on **MUST NOT** be sequential or guessable. | AUTHZ-002, SD-63 |
| SEC-007 | Personal data (name, phone, email, address, location) **MUST** be accessible only to its owner. Retention and deletion follow PRV-001 to PRV-004. | R-19, D-43 |
| PRV-001 | **Inactivity purge:** a daily job **MUST** permanently delete every account with no login and no authenticated activity for **30 days** (`privacy.inactivityPurgeDays`). That includes its profile, addresses, saved cards, wallet, bag, wishlist, recent searches, support requests and orders. Accounts with an order in a non-terminal status are skipped until it is terminal. | D-43, SD-66 |
| PRV-002 | **Deletion request:** an `account_deletion` support request **MUST** cause the account to be purged at the next daily run, under the same rules as PRV-001. | R-19, D-43, SD-66 |
| PRV-003 | **Reviews of purged accounts** are kept, so the rating aggregates stay consistent. The author name becomes "Former customer", and the link to the account is removed. The Verified Purchase badge stays. | R-20, SD-66 |
| PRV-004 | The Privacy Policy page **MUST** state the 30-day inactivity purge and how to request deletion. | R-19, D-43 |

## 10. Routes & data requirements

### 10.1 Routes (illustrative; final paths are set in the architecture phase)
| Route | Page | Auth |
|---|---|---|
| `/` | Landing | — |
| `/shop/<section>` | Section listing | — |
| `/shop/all?…` | All-products listing (cross-section cards) | — |
| `/<section>/<category>[/<subcategory>]` | Category or subcategory listing | — |
| `/collections/best-seller-styles` | Best Seller Styles | — |
| `/offers/hdfc` | Bank-offer listing | — |
| `/search?q=` | Search results | — |
| `/p/<product-slug>-<id>` | PDP (a single URL, whichever section the customer came from) | — |
| `/bag`, `/wishlist` | Bag, wishlist | — (device for guests) |
| `/login`, `/signup`, `/forgot-password` | Auth | — |
| `/checkout`, `/checkout/buy-now`, `/orders/<id>/pay` | Checkout and payment | ✅ |
| `/order-confirmation/<id>` | Confirmation | ✅ |
| `/account`, `/account/orders`, `/account/orders/<id>`, `/account/addresses`, `/account/cards`, `/account/gift-cards`, `/account/credits`, `/account/profile`, `/account/support` | Account | ✅ |
| `/pages/<slug>` | Content and policy pages | — |
| `/demo-help` | Demo guide: test cards, UPI IDs, gift codes, return tags | — |

The reserved first path segments `shop`, `collections`, `offers`, `search`, `p`, `bag`, `wishlist`, `login`, `signup`, `forgot-password`, `checkout`, `orders`, `order-confirmation`, `account`, `pages` and `demo-help` **MUST NOT** be used as section slugs. [SD-64]

### 10.2 Seed & reference data
| ID | Requirement | Source |
|---|---|---|
| DAT-001 | **Catalogue tree** as listed in intent §6.1 and the `README.md` subcategory lists, including T-6's changes: Men → Activewear; Gen Z → Gadgets covering headphones & speakers, watches & wearables and phone accessories. | I §6.1, T-6 |
| DAT-002 | **Products:** fictional brands; per-product attributes as in §4.1; **2–4 licensed images each**, with source and licence recorded. **Volume:**<br>• at least **6 products in every active subcategory**<br>• at least **48 products in every category-level listing** (two pages)<br>• about **1,800–2,500 products** in total | D-22, D-28, T-22, D-44 |
| DAT-003 | Every product with a rating **MUST** have seeded reviews that produce exactly that aggregate. | R-20 |
| DAT-004 | Shop by Category cards from intent §6.2, plus at least 5 hero slides, 1 of which links to Best Seller Styles. | I §6.2 |
| DAT-005 | Coupons, the bank offer, tax rates, delivery configuration, serviceable pincodes (≥ 200 across zones A, B and C, including at least one major city per state), the return policy, and the security question list (≥ 6 questions). | §5 |
| DAT-006 | **Test payment values:** one card number for each of {HDFC credit, HDFC debit, non-HDFC} × {random, success, failure, cancelled, timed-out}, all passing standard card number checks. UPI IDs `success@demo`, `failure@demo`, `cancel@demo`, `timeout@demo`. All of these are published on `/demo-help`. | R-10, SD-46 |
| DAT-007 | **Demo gift card codes:** at least 5, with different face values and one with a short validity. They are published on `/demo-help`. There are **no pre-made demo accounts**. | R-31, D-43 |
| DAT-008 | **Placeholder content:** Blog, Careers, Sitemap, Corporate Information, Terms, Privacy, Returns & Refunds, Shipping. Each is labelled as a placeholder. Plus FAQs (≥ 15 across 5 topics). | T-38, R-19 |
| DAT-009 | Reference data for Indian states and union territories. | ADDR-002 |

## 11. API behaviour (logical contract)

### 11.1 Conventions
| ID | Rule |
|---|---|
| API-001 | Every operation **MUST** be authorised on the server as in §2. Account-scoped operations derive the account from the session, never from a request parameter. |
| API-002 | **Error envelope:** `{ code, message, fieldErrors?: [{field, code, message}], changes?: [...], retryAfterSeconds? }`. `code` comes from §13.1. |
| API-003 | Operations that change data and could duplicate an effect (Pay, Retry, Place order, Cancel, Return request, Redeem gift card, Submit review, Submit support request) **MUST** accept an idempotency key. A repeated key returns the original response. |
| API-004 | List operations are paginated with a page size and an opaque cursor or page number, and return `totalCount` where §6 needs a count. |
| API-005 | Every amount is returned as integer paise **and** as a formatted string, so the client never formats differently from the system. |
| API-006 | Responses about bag, checkout or payment **MUST** include the full quote (PRC-012) and a `quoteId`. Pay **MUST** send the `quoteId` it showed the customer, and the system rejects a stale one with `QUOTE_CHANGED`. |

### 11.2 Operations
| Domain | Operation | Actor | Input → Output | Main errors |
|---|---|---|---|---|
| Catalogue | GetNavigationTree | any | → section/category/subcategory tree | — |
| Catalogue | ListProducts | any | scope (node, all, search q, bank-offer, best-seller), filters, sort, cursor → products (card data), totalCount, facets with counts | VALIDATION_ERROR |
| Catalogue | GetSuggestions | any | q (≥ 2 characters) → up to 8 grouped suggestions | — |
| Catalogue | GetProduct | any | slug/id → product, variants with availability, offers, coupons, rating aggregate, return eligibility, breadcrumbs hint | NOT_FOUND, PRODUCT_INACTIVE |
| Catalogue | GetRecommendations | any | productId → similar, related, bought together, complete the look | — |
| Catalogue | CheckPincode | any | pincode → serviceable, zone, deliveryDate, delivery rule | VALIDATION_ERROR |
| Reviews | ListReviews | any | productId, sort, filter, cursor → reviews, aggregate | — |
| Reviews | Create / Update / DeleteReview | customer | rating, text, images → review | REVIEW_NOT_ELIGIBLE, REVIEW_EXISTS, REVIEW_BLOCKED_CONTENT, VALIDATION_ERROR, NOT_FOUND |
| Reviews | ReportReview | customer | reviewId → ok | ALREADY_REPORTED, ACTION_NOT_ALLOWED (own review) |
| Auth | SignUp | guest | AUTH-001 fields + guest data → session, merge messages | IDENTIFIER_TAKEN, VALIDATION_ERROR |
| Auth | Login | guest | identifier, password + guest data → session, merge messages, notice | INVALID_CREDENTIALS, ACCOUNT_LOCKED |
| Auth | Logout | customer | → ok | — |
| Auth | StartReset / CompleteReset | guest | identifier; question + answer; new password → ok (neutral) | RESET_FAILED (neutral), ACCOUNT_LOCKED, VALIDATION_ERROR |
| Profile | GetProfile / UpdateProfile | customer | PRF-002 fields (+ current password where required) → profile | IDENTIFIER_TAKEN, INVALID_CURRENT_PASSWORD, VALIDATION_ERROR |
| Addresses | List / Create / Update / Delete / SetDefault | customer | ADDR-002 fields → address(es) incl. serviceable | LIMIT_REACHED, VALIDATION_ERROR, NOT_FOUND |
| Cards | List / Add / Remove / SetDefault | customer | card fields → masked card | NOT_TEST_CARD, CARD_EXPIRED, LIMIT_REACHED, VALIDATION_ERROR |
| Wallet | GetCredits | customer | → balance, ledger page | — |
| Wallet | RedeemGiftCard / ListGiftCards | customer | code → account gift card | GIFT_CARD_INVALID, GIFT_CARD_ALREADY_REDEEMED, GIFT_CARD_INACTIVE |
| Bag | GetBag (with quote) | any | (guest: device bag lines) → lines with flags, quote | — |
| Bag | AddItem / UpdateQty / RemoveLine / MoveToWishlist | any | variantId, qty → bag + quote + messages | OUT_OF_STOCK, PRODUCT_INACTIVE, QTY_LIMIT, LIMIT_REACHED |
| Bag | ApplyCoupon / RemoveCoupon | any | code → quote | COUPON_INVALID, COUPON_EXPIRED, COUPON_NOT_ELIGIBLE |
| Wishlist | Get / Add / Remove / MoveToBag | any | productId (+ variantId) → wishlist | PRODUCT_INACTIVE, OUT_OF_STOCK |
| Checkout | StartCheckout | customer | source (bag \| buy_now + variantId, qty) → checkout session, changes[], pending order? | PENDING_ORDER_EXISTS (with order summary), CHECKOUT_BLOCKED (with flags) |
| Checkout | SetPhone | customer | phone → savedToAccount bool | VALIDATION_ERROR |
| Checkout | SelectAddress / ApplyCoupon / SetPaymentSelection | customer | → quote | ADDRESS_NOT_SERVICEABLE, COD_NOT_ALLOWED, GIFT_CARD_UNUSABLE |
| Payment | Pay | customer | checkoutId, quoteId, payment selection (card ref + CVV \| new card \| UPI ID \| COD \| none), idempotencyKey → order id, status, attempt outcome | QUOTE_CHANGED (with changes), OUT_OF_STOCK, PENDING_ORDER_EXISTS, NOT_TEST_CARD, VALIDATION_ERROR |
| Payment | RetryPayment | customer | orderId, quoteId, selection, idempotencyKey → outcome | ORDER_NOT_PAYABLE, PAYMENT_IN_PROGRESS, QUOTE_CHANGED |
| Orders | ListOrders / GetOrder | customer | → orders / order with timeline, lines, refunds, returns, OTP (when Out for Delivery), tracking | NOT_FOUND |
| Orders | CancelPendingOrder / CancelLine | customer | orderId / lineId, reason → order, refund preview → refund | ACTION_NOT_ALLOWED |
| Orders | GetRefundPreview | customer | lineId (+ qty) or order → amount, destinations | ACTION_NOT_ALLOWED |
| Orders | CreateReturn | customer | lineId, qty, reason, comment → return request | ACTION_NOT_ALLOWED (window, returnability, qty) |
| Orders | SimulatorConfirmOtp / SimulatorReject | customer (simulator) | orderId, otp → order | OTP_INCORRECT, OTP_LOCKED, ACTION_NOT_ALLOWED |
| Orders | GetInvoice | customer | orderId → invoice (view and PDF) | NOT_FOUND, INVOICE_NOT_AVAILABLE |
| Search | Get / ClearRecentSearches | any | → terms | — |
| Support | ListFaqs / CreateSupportRequest / ListMyRequests | any / customer | SR fields → request | VALIDATION_ERROR |
| Content | GetLandingContent / GetPage | any | → slides, bank offer, cards, footer / page | NOT_FOUND |
| Scheduler | (internal) AdvanceOrders, ExpirePayments, ExpireHandovers, AdvanceReturns, CompleteRefunds, ResetDemoStock | system | — | — |

**API-007** — A scheduler job **MUST** be safe to run twice. Each transition is conditional on the current state, so running a job twice never applies a transition twice.

**API-008** — Customer actions and scheduler transitions on the same order **MUST** be serialised. *Example: a cancel arriving at the moment the order becomes Shipped either succeeds before Shipped or fails with `ACTION_NOT_ALLOWED`. It never succeeds after Shipped.*

## 12. Validation rules

| Field | Rule | Message |
|---|---|---|
| Name | 2–60 characters; letters, spaces, `.` `'` `-` | "Enter your name (2–60 letters)" |
| Email | RFC 5322 basic form, ≤ 254 characters; stored lower-case | "Enter a valid email address" |
| Phone | Indian mobile: 10 digits starting 6–9; an optional `+91` or `0` prefix is removed; stored as `+91XXXXXXXXXX` | "Enter a valid 10-digit mobile number" |
| Login identifier | Contains `@` → email rule; otherwise → phone rule | as above |
| Password | 8–64 characters, at least 1 letter and 1 digit | "Use 8–64 characters with at least one letter and one number" |
| Confirm password | Equals password | "Passwords don't match" |
| Security answer | 2–50 characters after normalisation | "Enter an answer (2–50 characters)" |
| Age confirmation | Must be ticked | "You must be 18 or older to create an account" |
| Date of birth | A valid past date; age ≥ 18 | "You must be 18 or older" |
| House/flat, street/area | 1–100 characters, required | "This field is required" |
| Building, landmark | ≤ 100 characters | — |
| City | 2–50 characters | "Enter a city" |
| State | One of the reference list | "Select a state" |
| Pincode | `^[1-9][0-9]{5}$` | "Enter a valid 6-digit pincode" |
| Address label | Home \| Work \| Other (custom text 1–20 characters) | "Enter a label" |
| Card number | 13–19 digits; passes the standard checksum; must be a designated test card | "Enter a valid card number" / "Use a demo test card…" |
| Name on card | 2–26 characters, letters and spaces | "Enter the name on the card" |
| Expiry | MM/YY, not in the past | "Card has expired" |
| CVV | 3 digits (4 for Amex) | "Enter a valid CVV" |
| UPI ID | `^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$` | "Enter a valid UPI ID" |
| Coupon code | 3–20 alphanumerics; case-insensitive | "Enter a valid coupon code" |
| Gift card code | 8–20 alphanumerics; case-insensitive | "Enter a valid gift card code" |
| Delivery OTP | Exactly 4 digits | "Enter the 4-digit OTP" |
| Search query | Trimmed, 1–100 characters | — |
| Review text | ≤ 2,000 characters | "Reviews can be up to 2,000 characters" |
| Return comment | ≤ 500 characters | — |
| Support message | 10–1,000 characters | "Describe your issue (10–1,000 characters)" |

**VAL-001** — The client **MUST** check every rule above. The system **MUST** check them again and is authoritative. The client's checks are only there to improve the experience.

## 13. Error handling

### 13.1 Error codes → customer messages
| Code | Customer message |
|---|---|
| VALIDATION_ERROR | Field messages from §12 |
| NOT_FOUND | "We couldn't find that." (page: "Page not found") |
| SESSION_EXPIRED | "Your session has expired. Please log in again." (login dialog) |
| UNAUTHENTICATED | Login prompt (AUTH-020) |
| INVALID_CREDENTIALS | "Incorrect email/phone or password." |
| ACCOUNT_LOCKED | "Too many attempts. Try again in <n> minutes." |
| RESET_FAILED | "The details you entered don't match our records." |
| IDENTIFIER_TAKEN | "An account with this email/phone already exists." (sign-up) / "This email/phone is already linked to another account." (profile) |
| INVALID_CURRENT_PASSWORD | "Your current password is incorrect." |
| RATE_LIMITED | "Too many requests. Please wait a moment and try again." |
| PRODUCT_INACTIVE | "This product is no longer available." |
| OUT_OF_STOCK | "<item, size> is out of stock." / "Only <n> left." |
| QTY_LIMIT | "Maximum 10 per item." |
| LIMIT_REACHED | Context-specific (addresses 10, cards 5, bag 50 lines) |
| COUPON_INVALID | "This coupon code isn't valid." |
| COUPON_EXPIRED | "This coupon has expired." |
| COUPON_NOT_ELIGIBLE | One of: "Add items worth ₹<n> more to use this coupon" · "This coupon doesn't apply to items in your bag" · "You've already used this coupon" |
| ADDRESS_NOT_SERVICEABLE | "We don't deliver to <pincode> yet." |
| COD_NOT_ALLOWED | "Cash on Delivery is available for amounts up to ₹10,000." |
| GIFT_CARD_INVALID / _ALREADY_REDEEMED / _INACTIVE / _UNUSABLE | See PRF-004. "This gift card has expired or has no balance." |
| NOT_TEST_CARD | "Use a demo test card. Real cards aren't accepted. See Demo help." |
| CARD_EXPIRED | "This card has expired." |
| QUOTE_CHANGED | "Some details changed:" followed by the itemised changes and "Review and continue" |
| PENDING_ORDER_EXISTS | The pending-order dialog (CHK-010) |
| CHECKOUT_BLOCKED | "Fix the highlighted items in your bag to continue." |
| ORDER_NOT_PAYABLE | "This order can no longer be paid." |
| PAYMENT_IN_PROGRESS | "A payment for this order is already in progress." |
| PAYMENT_FAILED / _CANCELLED / _TIMED_OUT | See PAY-010 |
| ACTION_NOT_ALLOWED | "This action isn't available for this order anymore." (followed by an order refresh) |
| OTP_INCORRECT / OTP_LOCKED | See DLV-004 |
| INVOICE_NOT_AVAILABLE | "The invoice will be available once your order ships." |
| REVIEW_NOT_ELIGIBLE | "You can review this product after it's delivered to you." |
| REVIEW_EXISTS | "You've already reviewed this product." (with an Edit link) |
| REVIEW_BLOCKED_CONTENT | "Your review contains words we don't allow. Please edit and try again." |
| ALREADY_REPORTED | "You've already reported this review." |
| (network / 5xx) | "Something went wrong. Please try again." with Retry. Inputs are kept. |

### 13.2 Rules
- **ERR-001** — After any error, the customer's form input **MUST** be kept, except for passwords, CVVs and OTPs.
- **ERR-002** — Network failures on reads **MUST** show a retryable error state. Failures on writes **MUST** show a message, and **MUST** be retried only by the customer, using the same idempotency key.
- **ERR-003** — When an operation returns `ACTION_NOT_ALLOWED`, `QUOTE_CHANGED` or `OUT_OF_STOCK`, the client **MUST** refresh the affected data before letting the customer continue.

## 14. Edge cases

| ID | Case | Expected behaviour | Ref |
|---|---|---|---|
| EC-01 | A product goes inactive while it's in a guest bag | Flagged "No longer available"; checkout blocked until it's removed | BAG-005 |
| EC-02 | The price drops between bag and Pay | QUOTE_CHANGED shows the new lower price; the customer continues at that price | PAY-006 |
| EC-03 | The coupon's validTo passes during checkout | Removed at re-validation, with a reason; the amount updates | CHK-002 |
| EC-04 | The last unit is held by another customer's Awaiting Payment order | Shown as out of stock until it's released | INV-001 |
| EC-05 | The customer pays in two tabs at once | The same idempotency key returns the same result; a different key gets PENDING_ORDER_EXISTS or PAYMENT_IN_PROGRESS | PAY-007, PAY-011 |
| EC-06 | The retry window expires while the simulator is "processing" | The attempt finishes first. If it succeeds, the order is Placed, because the expiry job checks the order state | API-007/008 |
| EC-07 | A gift card expires between quote and Pay | QUOTE_CHANGED; the gift card is removed from the selection | PAY-006 |
| EC-08 | Credits cover the whole amount and the bank offer would apply | The offer isn't applied; the remainder is ₹0 | PRC-009 |
| EC-09 | Wallet covers part and COD the rest; the order is rejected at delivery | The whole-order refund (including delivery) is capped at what was captured, so all wallet portions are refunded. The uncollected COD amount is no longer due. | RFD-002/003/007 |
| EC-10 | A partial return drops the order below ₹1,999 | No delivery charge is deducted | RFD-003 |
| EC-11 | All units of a line are returned across two requests | Each request is refunded separately; the totals equal lineNetPaid | RFD-001 |
| EC-12 | A cancel request arrives at the moment of Shipped | Serialised: either succeeds before Shipped or is rejected | API-008 |
| EC-13 | The default address is deleted | The most recent remaining address becomes the default | ADDR-005 |
| EC-14 | The checkout phone belongs to another account | Used for this order only, with a neutral message | CHK-003 |
| EC-15 | The merged bag exceeds 50 lines | Extra guest lines are skipped, with a message | AUTH-012 |
| EC-16 | A review is reported three times and then edited by its author | Stays hidden; the author sees "Hidden after reports" | REV-010/012 |
| EC-17 | The demo stock reset runs while a variant is held | That variant is skipped | INV-005 |
| EC-18 | A guest's browser storage is unavailable (private mode) | The bag works for the session, with a warning | FE-003 |
| EC-19 | The map provider is down | Manual entry is offered | ADDR-003 |
| EC-20 | The customer logs out with an Awaiting Payment order | The order continues to expire normally; the customer sees it on their next login | PAY-012 |
| EC-21 | A Buy Now item is also in the bag | The bag isn't touched by a Buy Now success | PAY-009 |
| EC-22 | The 5th wrong OTP on attempt 2 | Returned to Origin straight away | DLV-004/006 |
| EC-23 | A product's only variant is out of stock and it's wishlisted | Move to Bag disabled; "Out of stock" shown | WSH-001 |
| EC-24 | The coupon per-customer limit is reached in a parallel order | At Pay, QUOTE_CHANGED removes the coupon | PRC-002 |

## 15. Worked examples (normative)

These examples are acceptance tests for §6.13 and §6.20. An implementation **MUST** reproduce these exact numbers.

**Setup:**
- Seed configuration as in §5. Coupon `WELCOME10` is applied.
- Payment: an HDFC credit test card, with "Use credits" on and a credit balance of ₹500.

| Line | Item | MRP × qty | Selling × qty | lineValue | Bank-offer eligible | Tax rate |
|---|---|---|---|---|---|---|
| A | T-shirt | ₹1,499 × 2 | ₹999 × 2 | ₹1,998.00 | yes | 5% |
| B | Sneakers | ₹3,999 × 1 | ₹2,799 × 1 | ₹2,799.00 | yes | 5% |
| C | Face serum | ₹899 × 1 | ₹719 × 1 | ₹719.00 | no | 18% |

**WX-1 — Quote:**

| Step | Value |
|---|---|
| Total MRP | ₹7,896.00 |
| Bag value (PRC-001) | ₹5,516.00 · Discount on MRP ₹2,380.00 |
| Coupon (PRC-003) | 10% of ₹5,516 = ₹551.60 → capped at **₹300.00** |
| Coupon shares (PRC-004) | A ₹108.67 · B ₹152.23 · C ₹39.10 (sum ₹300.00) |
| Delivery (PRC-005) | ₹5,516 − ₹300 = ₹5,216 > ₹1,999 → **FREE** |
| Bank-offer base (PRC-006) | (1,998 − 108.67) + (2,799 − 152.23) = ₹4,536.10 ≥ ₹2,500 |
| Bank offer | 10% = ₹453.61 → rounded to **₹454.00** (below the ₹1,000 cap) |
| Bank-offer shares | A ₹189.10 · B ₹264.90 |
| **Order total** (PRC-007) | 5,516 − 300 − 454 + 0 = **₹4,762.00** |
| Line net paid | A ₹1,700.23 · B ₹2,381.87 · C ₹679.90 (sum ₹4,762.00) |
| Tax portion (PRC-010; per line, rounded half up to paise) | A ₹80.96 · B ₹113.42 · C ₹103.71 → "Inclusive of ₹298.09 tax" |
| Wallet (PRC-008) | Credits ₹500.00 → **remainder ₹4,262.00 on the HDFC card** |

**WX-2 — Return 1 of 2 units of line A after Delivered:**
- Per-unit shares of ₹1,700.23 are ₹850.11 and ₹850.12 (the remainder goes to the last unit).
- Refunding the first unit gives **₹850.11 → card**. Card/UPI comes first, and the card has ₹4,262.00 refundable.

**WX-3 — Cancel line C while the order is Packed (instead of WX-2):**
- Refund **₹679.90 → card**.
- No delivery charge is involved, because delivery was free and this isn't a whole-order cancellation.

**WX-4 — Cancel all three lines while Packed:**
- The refunds are ₹1,700.23 + ₹2,381.87 + ₹679.90 = ₹4,762.00 in total, with delivery ₹0.
- Destinations are applied cumulatively, card first: the card gets ₹4,262.00 and credits get ₹500.00.

## 16. Spec decisions (SD)

These were decided while writing this spec, within the latitude `intent.md` delegated to the team ("exact values are set in the spec", and the owner's instruction to settle minor details). **The owner may override any of them.**

| # | Decision |
|---|---|
| SD-01 | Money is stored in paise and displayed with ₹ and Indian digit grouping. Paise are shown only when they are not zero. |
| SD-02 | IST throughout. Durations are measured as elapsed time. |
| SD-03 | Guests can apply a coupon in the bag. The per-customer limit is checked after login. |
| SD-04 | Each colour is a separate product, and variants differ only by size. The card's sub-label is the product's subtitle. |
| SD-05 | Discount % = floor((mrp − selling) / mrp × 100). |
| SD-06 | Rating aggregates count visible reviews only. |
| SD-07 | At most 10 recent searches, de-duplicated case-insensitively. |
| SD-08 | Addresses add a recipient name and phone (defaulting to the profile's). At most 10 addresses. |
| SD-09 | Deleting the default address makes the most recent remaining address the default. |
| SD-10 | At most 5 saved cards. Removing the default card makes the most recent remaining card the default. |
| SD-11 | Credits don't expire. |
| SD-12 | At most 50 bag lines. |
| SD-13 | Guest data is kept for 30 days from its last update. |
| SD-14 | Delivery flat charge ₹99. COD maximum ₹10,000 of the amount payable on delivery. |
| SD-15 | HDFC offer: 10%, maximum ₹1,000, minimum eligible value ₹2,500, credit and debit cards. |
| SD-16 | The seed coupon set in §5. |
| SD-17 | Illustrative tax rates per category, labelled as samples. The delivery charge is taxed at 18%. |
| SD-18 | Delivery zones A/B/C take 2/4/6 days. |
| SD-19 | The status timer steps every 2 minutes. The handover window is 10 minutes. |
| SD-20 | Payment outcome weights 70/15/10/5. Returns 80/20 (approval) and 80/20 (pickup). |
| SD-21 | Demo stock resets daily at 03:00 IST, skipping held variants. |
| SD-22 | Sessions last at most 24 hours, with a 60-minute idle timeout. |
| SD-23 | Listing page size 24. Suggestions: minimum 2 characters, maximum 8, 250 ms debounce. |
| SD-24 | Review limits: 5 images, JPEG/PNG/WebP, 5 MB each, 2,000-character text. |
| SD-25 | The demo banner is non-dismissible, with the text in §5. |
| SD-26 | A 404 page with search and a link home. |
| SD-27 | The bag badge counts total units. |
| SD-28 | Card image ratio 3:4. Columns 6/5/4/2 by width. |
| SD-29 | Search queries are limited to 100 characters. |
| SD-30 | Discount filter buckets of 10–70%. Rating filter buckets 4★+ and 3★+. |
| SD-31 | The weighting formula for the Recommended sort. |
| SD-32 | Cards show the price of the lowest-priced available variant. |
| SD-33 | Similar products are within ±30% of the price. Rails show at most 12 products. |
| SD-34 | Reviews load 10 per page. The default sort is most recent. |
| SD-35 | Review eligibility survives a later return. A cancelled line gives no eligibility. |
| SD-36 | Aggregates update within 1 minute. |
| SD-37 | Authors can see their own hidden reviews. |
| SD-38 | Lockout responses look the same whether or not the identifier exists (client-based counting for unknown identifiers). |
| SD-39 | On merge, the account's coupon wins. Recent searches are merged. Inactive lines are carried over flagged. |
| SD-40 | Gender options; date of birth is optional. |
| SD-41 | Orders keep an address snapshot. |
| SD-42 | 5-second Undo after removing a bag line. |
| SD-43 | Discounts are rounded to the nearest rupee and pro-rated by largest remainder in paise. |
| SD-44 | Gift card first, then credits. Credits are used in full up to the amount due (no partial-amount entry). The bank offer is dropped when the wallet covers everything. |
| SD-45 | Buy Now quantity can be changed in checkout and ignores the bag coupon. |
| SD-46 | Test UPI IDs force outcomes. Other valid UPI IDs get a random outcome. |
| SD-47 | "Save this card" saves the card even if the payment fails. |
| SD-48 | Order number format. |
| SD-49 | The expected date follows the zone calendar even though simulated delivery is faster. |
| SD-50 | The OTP is generated at Placed and shown from Out for Delivery. A re-attempt keeps the same OTP. |
| SD-51 | 5 wrong OTPs end the delivery attempt. |
| SD-52 | Cancellation is for the whole line. An Awaiting Payment order is cancelled as a whole. |
| SD-53 | The list of cancellation reasons. |
| SD-54 | Returns allow choosing a quantity. The list of return reasons. |
| SD-55 | The texts for rejected-return reasons and closed returns. |
| SD-56 | Return test tags `#approve`, `#reject` and `#pickupfail` in the comment. |
| SD-57 | Invoices are available from Shipped, as on-screen and PDF. |
| SD-58 | Customers can't cancel a return request in V1. |
| SD-59 | A warning when device storage is unavailable. |
| SD-60 | Page title patterns. |
| SD-61 | Rate limit 20 requests a minute on sensitive operations. |
| SD-62 | Image metadata is removed from review uploads. |
| SD-63 | IDs in URLs aren't guessable. |
| SD-64 | Reserved route segments. |
| SD-65 | The sign-up credit grant is ₹500. |
| SD-66 | Purge details: the inactivity definition, skipping accounts with non-terminal orders, a deletion request purged at the next run, and reviews kept anonymised. |

## 17. Open questions — resolved

There are no open questions. The three raised while writing this spec were resolved by the owner on 2026-10-06:

| # | Question | Decision | Applied in |
|---|---|---|---|
| SQ-1 | Password reset can't be neutral if it shows the customer's own security question | **(a)** The customer chooses their question from the full list. Sign-up revealing taken identifiers is an accepted risk. → D-42 | AUTH-002, AUTH-008, UF-13 |
| SQ-2 | Pre-made demo accounts and personal data in a public demo | **(c)** No demo accounts. Every new sign-up gets starter credits, with the abuse risk accepted. Personal data is purged after 30 days of inactivity, and deletion requests are fulfilled through that purge. → D-43 | AUTH-003, PRF-006, SEC-004, PRV-001–004, DAT-007, §5 |
| SQ-3 | Catalogue size | **(a)** At least 6 per subcategory, at least 48 per category listing, about 1,800–2,500 products, 2–4 images each. → D-44 | DAT-002 |

**Deferred to the architecture phase (not blocking):** the map provider (R-23), the search engine for typo tolerance (SRC-004), image storage and CDN, PDF invoice generation, and the scheduler mechanism.

## 18. Traceability (intent → spec)

| Intent | Spec |
|---|---|
| §1, R-01 | §1, GLB-001, SEC-*, PRV-* |
| §3 roles | §2 |
| §6.1 | NAV-*, §10.1, DAT-001 |
| §6.2 | LND-*, DAT-004, DAT-008 |
| §6.3 | SRC-* |
| §6.4 | PLP-* |
| §6.5 | PDP-* |
| §6.6 | REV-* |
| §6.7 | AUTH-*, SEC-* |
| §6.8 | PRF-*, WSH-* |
| §6.9 | ADDR-* |
| §6.10 | BAG-*, PRC-* |
| §6.11 | CHK-*, PAY-*, PRC-*, INV-001–003 |
| §6.12 | ORD-*, DLV-*, INV-I-*, §7.1 |
| §6.13 | CNL-*, RET-*, RFD-*, INV-004–006, §7.2–7.5 |
| §7 rules | AUTHZ-*, API-*, FE-002, INV-006 |
| §8 quality | FE-001, FE-004–006 |
| §12 risks | AUTH-002, AUTH-005–010, PAY-003, SEC-004, PRV-* |
