# Product Intent — Fashion & Lifestyle Ecommerce (Customer Web App, V1)

> **Status:** v2.1, **APPROVED**. Review findings R-01 to R-38 are resolved, and the spec questions are recorded as D-42 to D-44. See `spec.md` v1.1.
> **Last updated:** 2026-10-06
> **Source:** Product owner's requirements (see `README.md`), refined through owner decisions and a requirements review.
> **Scope of this document:** What we are building and why. It does not cover technical architecture, tech stack or implementation.
> **Tag legend:**
> - **[D-n]** is an owner decision (§14).
> - **[R-n]** is a review finding resolved with the owner's approval (§15).
> - **[T-n]** is a team decision the owner can override by saying "change T-n" (§16).
> - Configurable values (amounts, timers, thresholds) are named here; their exact values are set in the spec.

---

## 1. What the product is

A customer-facing **web shopping application** for fashion, beauty, home and lifestyle products for men, women and kids, plus a trend-led **Gen Z** section.

**V1 is a publicly accessible showcase.** It delivers a **production-quality shopping experience** (look, feel, flows, validation and error handling), but it is **clearly labelled as a demo** and processes **no real transactions**:
- payments are simulated
- fulfilment is simulated
- the catalogue is sample data

**[R-01]**

V1 covers the **customer side only**. A customer can:
- discover products, search and filter
- view product details
- manage a wishlist and bag
- add addresses
- check out with a simulated payment
- track orders
- handle basic cancellations, returns and refunds

## 2. The problem it solves

People want to look good and stay stylish without the effort of going out to shop. The product aims to:

1. **Bring the best items at the most affordable prices.** Discounts, offers and coupons are visible, and the price a customer sees is accurate.
2. **Make shopping effortless.** Navigation is clear, search is strong, filters are useful, and the path from discovery to checkout is smooth.
3. **Build trust.** Products are original, returns are easy on eligible items, prices and orders are always accurate, and account data is private.

## 3. Who will use it

- **Shoppers of all ages.** The catalogue serves everyone from infants to older adults. Purchases for children are made by adult account holders (18+). **[T-41]**
- **Style range.** Products run from simple everyday basics to bold, trend-driven pieces.
- **Two visitor states:**
  - **Guest.** Can browse everything and use the **bag and wishlist** on their device. Must log in or sign up to **place an order**. **[D-3, D-30, D-37]**
  - **Logged-in customer.** Can also:
    - place orders and view them
    - keep a synced bag and wishlist
    - manage addresses, saved cards, gift cards and credits
    - write reviews
- **Devices.** Desktop, tablet and mobile web browsers. There are no native apps.

## 4. Glossary [R-36]

| Term | Meaning |
|---|---|
| **Landing page** | The home page. The logo always returns here. |
| **Home** (section) | The home-goods section (furniture, decor and so on). It is not the landing page. |
| **Section** | A top-level header entry: Men, Women, Kids, Home, Beauty or Gen Z. |
| **Category / Subcategory** | The second and third levels of the catalogue, for example Men → Topwear → T-shirts. |
| **Bag** | The shopping cart. "Bag" is the only customer-facing term. |
| **Wishlist** | Products saved for later. A wishlist entry is a product, not a size. |
| **Coupon** | A code the customer enters. It gives a discount on the order. |
| **Offer** | A discount the customer doesn't enter as a code. This is either a product discount or the **bank offer**. |
| **Bank offer** | The HDFC card offer. It is promoted by the **bank-offer tile** on the landing page. |
| **Credits** | Shopping credits held in the customer's account. Credits come from refunds and a one-time sign-up grant. |
| **Gift card** | A prepaid card, redeemed into the account by its code. It is used as a payment method. |
| **Awaiting Payment** | An order created at Pay whose payment has not yet succeeded. |
| **Delivered** | The order was handed over and confirmed with the delivery OTP. "Completed" means the same thing. |
| **Delivery OTP** | A 4-digit code shown in the order details that the customer shares with the delivery person. |
| **System of record** | The server-side source of truth for business data. Screens never decide prices, stock, eligibility or status. |
| **Demo labelling** | A visible notice that the site is a showcase and makes no real transactions. |

## 5. Core customer journey

```
Land on landing page
  → Discover (hero carousel · bank-offer tile · Shop by Category · mega menu · search)
  → Browse listing (filters · sort · infinite scroll · wishlist from cards)
  → Product detail (gallery · variants · price/offers · pincode check · reviews · recommendations)
  → Add to Bag / Buy Now / Wishlist        ← guests can use bag & wishlist; login required to order
  → Bag (validate items · coupon · bank-offer preview · delivery estimate · price summary)
  → Checkout (login if guest · phone number · address → order summary → payment)
  → Order confirmation
  → Profile › Orders (status timeline · delivery OTP · tracking · invoice · cancel / return / refund)
  → Review the product once delivered
```

Before any important action, the latest information is **re-validated by the system of record**. Important actions are: Proceed to Checkout, checkout start, Pay, cancellation and return. If anything changed, the customer is told exactly what changed and can fix it before continuing.

## 6. Main features and capabilities

### 6.1 Global header & navigation
- **Logo:** always returns the customer to the landing page.
- **Main sections:** Men, Women, Kids, Home, Beauty and Gen Z.
- **Utility icons:** Search, Profile, Wishlist and Bag, each with a text label below it. The Bag icon shows the number of items in the bag.
- **Search:**
  - On desktop, the search bar is always visible.
  - On mobile, a search icon opens full-screen search.
  - **[T-31]**
- **Mega menu:**
  - Hovering over a section shows its categories and subcategories in a clear hierarchy.
  - On mobile and tablet, a slide-out menu with expandable levels replaces hover.
  - **[T-32]**
- **Flexible catalogue hierarchy:** Section → Category → Subcategory. Categories and subcategories can be added, removed or reorganised through data.
- **Predictable URLs:**
  - A section is `/shop/<section>`, for example `/shop/men`.
  - A category is `/<section>/<category>`, for example `/men/topwear`.
  - A subcategory is `/<section>/<category>/<sub-category>`, for example `/men/topwear/t-shirts`.
  - Listings that span sections, such as some Shop by Category cards, use a filtered all-products listing, for example `/shop/all` with filters.
  - **[T-5, R-33]**

#### Initial catalogue structure
| Section | Categories (full subcategory lists in `README.md`) |
|---|---|
| **Men** | Topwear, Bottomwear, Footwear, Traditional Wear, Activewear, Personal Care, Sunglasses, Watches, Innerwear, Sleepwear |
| **Women** | Indian Wear, Western Wear, Topwear, Bottomwear, Dresses, Footwear, Activewear, Lingerie, Sleepwear, Beauty & Personal Care, Handbags, Jewellery, Watches, Sunglasses, Accessories |
| **Kids** | Boys, Girls, Infants, age-based / gender-neutral; Clothing, Footwear, Toys, School Supplies, Baby Care, Accessories |
| **Home** | Furniture, Home Decor, Furnishings, Kitchen & Dining, Storage & Organisation, Lighting, Bath, Bedding, Home Improvement, Appliances, Cleaning |
| **Beauty** | Makeup, Skincare, Haircare, Fragrances, Bath & Body, Personal Care, Grooming, Oral Care, Beauty Tools |
| **Gen Z** | Trending fashion, Streetwear, Oversized, Y2K, Co-ords, Partywear, Graphic apparel, Sneakers, Bags, Accessories, Jewellery, Beauty, Skincare, Gadgets (headphones & speakers, watches & wearables, phone accessories), Lifestyle |

- A product can appear in more than one section.
- Breadcrumbs follow the path the customer took, falling back to the product's primary section.
- Products carry attributes that cross-section listings filter on, such as an "inclusive sizing" tag.
- **[T-6, T-29, R-33]**

### 6.2 Landing page (top to bottom)
1. **Hero / banner carousel.**
   - Slides show offers, campaigns and collections. Each slide links to its shopping page, and one slide links to **Best Seller Styles**. **[T-44, R-34]**
   - Slides autoplay at a configurable interval (default 5s) and pause on hover and keyboard focus.
   - Previous, next and pause controls are visible, with at most 8 slides. Slides are set in configuration.
   - **[R-38]**
2. **Bank-offer tile.**
   - A clickable coupon-style image for the HDFC card offer, with a short "T&C apply" note.
   - Clicking it opens a listing of **products eligible for the bank offer**, with the relevant filters already applied.
   - **[D-4, R-07]**
3. **Shop by Category.**
   - A responsive grid of category cards that continues across as many rows as needed.
   - Each card shows an image, the category name, an offer line (such as "40–80% OFF") and a "Shop Now" call to action.
   - Cards have consistent dimensions, image ratios and spacing, a subtle border and slightly rounded corners.
   - Initial cards are the categories in the requirements: Ethnic Wear, Casual Wear, Men's and Women's Activewear, Western Wear, Sportswear, Loungewear, Innerwear, Lingerie, Watches, Grooming, Beauty & Makeup, Kids Wear, Men's and Women's Footwear, Bags, Belts & Wallets, Office Wear, Men's Ethnic Wear, Home Decor, Handbags, Headphones & Speakers, Jewellery, Size-Inclusive Styles, Watches & Wearables, Sleepwear, Eyewear and others. **[T-6]**
   - Every card links to its category or listing page.
   - Cards are **data-driven**, so they can be added, reordered or changed without changing how the section is built.
   - Desktop shows several cards per row. Tablet and mobile use fewer columns while keeping text readable.
4. **Footer**, in this order:
   1. **Useful links and trust pointers.**
      - Links: Blog, Careers, Sitemap, Corporate Information.
      - **Policy pages:** Terms of Use, Privacy Policy, Returns & Refunds Policy, Shipping Policy. **[R-19]**
      - Trust pointers: "100% ORIGINAL", "Easy 14-day returns on eligible items", and others. **[R-17]**
   2. **Popular searches.** A curated, configurable list. **[T-20]**
   3. **Company details.** Registered address, telephone number and CIN. These are clearly marked sample values. **[T-38]**
   4. **"How we make shopping easy":** 3–5 benefit statements.
   - Social media links also appear in the footer.
- Placeholder pages (Blog, Careers, Sitemap, Corporate Information and the policy pages) contain labelled placeholder text. **[T-38, R-19]**
- **Demo labelling:** every page carries a visible notice that the site is a showcase. **[R-01]**

### 6.3 Search
- Search is a **first-class experience**.
- **Live suggestions** start from **2 characters** and show **up to 8** items. They draw on products, categories, brands, recent searches and popular searches. **[R-29]**
- Recent searches:
  - are kept on the device for guests and on the account for logged-in customers
  - can be cleared by the customer
  - **[T-20, R-29]**
- Customers can search by product name, brand, category, colour and other product attributes.
- **Typo tolerance:**
  - A word of up to 5 letters matches with 1 character wrong. A longer word matches with up to 2 wrong.
  - Results are returned when a relevant product exists.
  - **[R-26]**
- Pressing Enter or choosing a suggestion opens the **search results page**. It has:
  - the same filters and sorting as category pages
  - a product count and applied-filter chips
  - clear-one and clear-all actions
  - infinite scroll
- **Search within a category** is the same search with that category filter already applied. **[R-29]**
- When nothing matches, a **helpful empty state** suggests popular searches and categories.

### 6.4 Product listing pages
These cover sections, categories, subcategories, search results, the bank-offer listing and Best Seller Styles.

- **Filters:**
  - gender
  - category
  - brand
  - price (with a range slider)
  - colour
  - discount range
  - size
  - customer rating
  - an **in-stock only** toggle

  Category-specific filters are deferred. **[T-50]**
- **Sorting:** Recommended (the default), What's New, Price, Discount and Customer Rating.
  - Recommended uses documented weights of rating, rating count and recency.
  - What's New uses each product's listing date.
  - **[T-21, R-30]**
- The page shows a **product count** and **applied filters**. Filters can be cleared one at a time or all at once.
- Results are loaded **in pages by infinite scroll**. The scroll position is restored when the customer returns from a product page. **[T-20]**
- **Filter persistence:**
  - Within the same section, moving between listings keeps the sort and the filters the listings share (brand, price, colour, size, rating, discount).
  - Changing section resets them.
  - **[R-26]**
- On desktop, filters sit in a sidebar. On mobile, a dedicated Filter & Sort sheet is used.
- **Product card:**
  - **Layout:** borderless, with the image, rating and rating count.
  - **Text:** the product name is the label and the variant is the sublabel. Long text is truncated.
  - **Price:** the original price struck through, then the discounted price and the discount % in brackets. A product with no discount shows only its price.
  - **Wishlist:** a toggle sits on the card.
  - **No ratings:** no rating badge is shown.
  - **Out of stock:** the product is labelled and shown after in-stock items. **[T-46]**

### 6.5 Product detail page
- **Image gallery** with multiple images and zoom or full view.
- **Product basics:** brand, name, rating and rating count.
- **Price:**
  - current price, original price and discount
  - applicable offers, including the bank offer
  - available coupons
- All **variants**: size, colour and others. Unavailable variants are marked and disabled.
- **Size guide** for apparel and footwear.
- **Product information:** description, material and care, specifications, and **return eligibility**. **[R-17]**
- **Pincode check:**
  - shows serviceability, the delivery charge rule and expected delivery date
  - a guest's pincode is remembered on the device
  - **[T-17, R-21]**
- **Actions:** select a variant, **Add to Bag**, **Buy Now**, wishlist toggle.
  - Buy Now goes to checkout with only this item.
  - Guests are prompted to log in for Buy Now. After login, Buy Now continues with the same item.
  - **[T-28, R-22]**
- **Recommendations:** similar products, related products, frequently bought together and complete the look. These are rule-based or curated. **[T-21]**
- **Stale data:**
  - If the product becomes unavailable, its price changes, or the selected variant runs out, the page shows a specific message and disables the affected action.
  - The customer never proceeds on outdated information.
  - **[R-26]**

### 6.6 Ratings & reviews
- The product page shows:
  - overall rating and total number of ratings
  - a breakdown by star level
  - written reviews
- **Eligibility:** only customers whose order containing the product is **Delivered** can rate. **[D-12]**
  - One review per customer per product.
  - A rating without text is allowed.
  - Up to 5 images per review, within file type and size limits.
  - **[T-19, R-18]**
- **Verified Purchase** marks reviews from eligible customers. Sample reviews seeded with the catalogue don't carry the badge. **[R-20]**
- Customers can edit or delete **only their own** reviews.
- **Moderation:**
  - Text goes through a blocked-word check on submission.
  - Logged-in customers can **report** a review.
  - After **3 reports**, the review and its images are hidden.
  - **[T-19, R-18]**
- **Sorting and filtering:**
  - Sort by most recent, or highest or lowest rating.
  - Filter by star rating and "with images".
  - There are no "helpful" votes.
- The section has loading, empty and error states.
- Ratings stay **consistent everywhere**. Every rating shown is backed by actual review records, including seeded ones. **[R-20]**

### 6.7 Accounts, authentication & security
- **Sign up and log in** with an **email address or a phone number**, plus a password.
  - Identifiers are not verified.
  - A customer who has both identifiers can log in with either.
  - **[D-1]**
- Email and phone are each **unique across accounts**. **[R-08]**
- **Password policy:** at least 8 characters, including a letter and a number. **[R-12]**
- **Failed logins:**
  - 5 failed attempts lock the account for 15 minutes.
  - Error messages never reveal whether an account exists.
  - **[R-12]**
- **Security question:**
  - Chosen at sign-up from a **predefined list**.
  - Answers ignore case and extra spaces.
  - Its **only** use is resetting a forgotten password.
  - **[D-2, R-11]**
- **Password reset:**
  1. The customer enters their email or phone.
  2. They **choose their security question from the full list** and answer it. Their own question is never displayed. **[D-42]**
  3. They set a new password.

  There are 5 attempts, then a 15-minute lockout. Responses never reveal whether an account exists. After a reset, an in-app notice appears at next login. **[T-23, R-11]**
- **Phone at ordering:**
  - A customer without a phone number on file **must provide one when placing an order**, and it is saved to their account. **[D-23, D-31]**
  - If that number belongs to another account, it isn't saved. The customer sees a neutral message and can use it as a contact number **for that order only**. **[R-08]**
- **Age:** account holders confirm they are **18 or older** at sign-up. **[T-41]**
- **Sign-up grant:** every new account receives a one-time grant of starter credits. **[D-43]**
- **Data retention:** accounts inactive for **30 days** are deleted with their personal data. A deletion request through Contact Us is fulfilled the same way. **[D-43]**
- **Logout:** asks for confirmation, clears account data from the device, and takes the customer to the landing page. The device then starts with an empty guest bag. **[T-33, R-32]**
- **Sessions:**
  - Sessions expire after a configurable period and after inactivity. There is no "remember me".
  - After re-login, the customer returns to the same page with the bag kept.
  - **[T-24]**
- **Guest → login:**
  - Guests can use the bag and wishlist.
  - On login, both merge into the account:
    - The same item in both bags has its **quantities added together**, capped at stock or the item limit with a message. **[D-30, T-57]**
    - Wishlist duplicates are removed. **[R-32]**
  - Guest data is kept on the device for 30 days. **[T-57]**
  - After logging in from a prompt, the interrupted action continues. **[R-22]**
- **Sync:** a logged-in customer's bag and wishlist sync across devices. **[R-32]**
- **Protected areas:**
  - Profile, Orders, Addresses, Saved Cards, Gift Cards, Credits and the other account pages are available only to the logged-in owner.
  - The wishlist is open to guests on their own device.
- Every auth step has clear loading, validation, success and error messages.
- No customer can ever see another customer's data.

### 6.8 Profile & account sections
The profile header shows the customer's name, email or phone, and an **Edit Profile** option.

| Section | Customer can… |
|---|---|
| **Orders** | See order history and details, the status timeline, delivery OTP, tracking and invoice. Cancel or return eligible items (§6.12–6.13). |
| **Wishlist** | View items and remove them. **Move to Bag** asks for a size if needed, then removes the item from the wishlist. Unavailable items are clearly marked. **[T-26]** |
| **Gift Cards** | **Redeem a gift card code into the account.** See each card's balance, status, expiry and history. **[R-05]** |
| **Credits** | See available credits (including the sign-up grant) and their transaction history. **[T-10, D-43]** |
| **Saved Cards** | See masked card information only. Add, remove, and set a default card. **[D-33, T-60]** |
| **Saved Addresses** | Add, edit, delete and set a default address, using the address flow (§6.9). |
| **Edit Profile** | Update name, email, phone, gender, date of birth, password and security question. Changing the password, a login identifier or the security question requires the current password. **[T-25]** |
| **Contact Us** | Browse help topics and FAQs. Raise a support request, which gets a request ID and shows the status "Submitted". There are no support replies in V1. **Request account deletion** through a dedicated request type. **[T-37, R-19]** |
| **Logout** | Log out after a confirmation step. |

Every section works on desktop and mobile and has loading, empty, success and error states.

### 6.9 Address selection (map-first)
- Adding an address is **map-first** and works in two steps. An **"Enter address manually"** option is always visible. **[R-23]**
  1. **Locate:** search for a place or move a pin on a map. The selected location fills in basic location details.
  2. **Complete details:** house or flat number, building, street or area, landmark, city, state, pincode, and a label such as Home or Work.
- If the map or location search fails, or location access is denied, the customer enters the address manually. **[T-42]**
- **Validation:**
  - The pincode must be a 6-digit Indian pincode.
  - Serviceability is checked against the predefined list.
  - An address in an unserviceable pincode can be saved, but **can't be used for delivery**. A clear message explains why.
  - **[R-24, D-16]**
- Customers can edit an address, move its pin, delete it and set a default.
- The **same flow** is used from Saved Addresses, the bag and checkout.
- The map service is an external dependency. The provider is chosen in the architecture phase. **[R-23]**

### 6.10 Bag
- The header shows the item count.
- Each line shows:
  - image, brand, name and selected size or variant
  - price and discount
  - quantity controls (limit **10 per item**, or stock if lower) **[T-27]**
  - **Remove** and **Move to Wishlist**
- The bag handles:
  - **items that became unavailable**
  - **price changes**
  - **variants that are no longer available**
  - **quantities above stock**

  Each gets a specific message and a fix action.
- **Coupons:**
  - One code can be entered.
  - Invalid, expired and ineligible codes get distinct messages.
  - If a bag change makes an applied coupon ineligible, the coupon is removed automatically with a message.
  - **[R-25]**
- **Bank-offer preview:** if the bag has eligible items, it shows "Pay with an HDFC card and save ₹X". **[R-07]**
- **Price summary:**
  - lines for item total, product discounts, coupon, delivery charge and the amount to pay
  - all prices **include tax**, and the tax portion is shown for information **[D-36]**
  - **delivery is free** when the bag value after product discounts and coupon is **above ₹1,999**; otherwise a configurable flat charge applies **[D-27, T-16]**
- **Delivery details:**
  - Logged-in customers see their delivery address and expected delivery.
  - Guests see the estimate for their remembered pincode, or a prompt to enter one.
  - **[R-21]**
- **Proceed to Checkout:**
  - re-validates the bag before continuing
  - asks a guest to log in or sign up, then continues to checkout **[R-22]**
  - if the customer already has an **Awaiting Payment** order, offers **Retry payment** or **Cancel it** instead of creating another order **[R-09]**
- An **empty bag** shows a simple message and a Continue Shopping button.
- The bag **persists**. A guest bag is kept on the device and a logged-in bag syncs to the account.

### 6.11 Checkout & payment
- Checkout requires login. **[D-37]**
- Steps are clearly separated: **Address → Order Summary → Payment**.
- A **phone number is mandatory** to place an order (§6.7). **[D-23, R-08]**
- **Address step:**
  - The customer picks or adds an address.
  - The address must be complete and **serviceable**.
  - Expected delivery is shown.
- **Order summary step:** items, variants, quantities, prices, discounts, coupon, delivery charge and tax portion (for information).
- **Re-validation** happens at checkout start and again at Pay. It covers availability, price, discounts, coupon eligibility, stock and the final amount. Any change is explained, and the customer can update the order before continuing.
- **Payment step: [D-25, D-32, R-06]**
  - Methods: **card**, **UPI**, **cash on delivery (COD)**, **gift card** and **credits**.
  - The customer may apply **credits** and/or **one redeemed gift card** (with a balance). The remainder is paid by **at most one** of card, UPI or COD.
  - If credits and gift card cover the full amount, the order succeeds without the payment simulation.
  - COD has a configurable maximum order value. **[T-59]**
  - **Card:**
    - Pick a **saved card** (shown masked; re-enter the CVV), or enter a new card with **name on card, card number, expiry and CVV**.
    - New cards can be saved with "Save this card".
    - Only masked number, network, bank and expiry are ever stored, never the full number or CVV.
    - Only **designated test card numbers** are accepted.
    - **[D-29, D-33, T-60]**
  - **Bank offer:**
    - When the chosen card is an HDFC card, the offer is applied to the value of eligible items.
    - The final amount updates **before** Pay.
    - If a retry uses a non-HDFC card, the offer is removed and the new amount is shown before Pay.
    - **[R-07]**
  - A clear warning reads: **"This is a demo — do not enter real card details."** **[D-33]**
  - The final payable amount is shown and confirmed before Pay.
- **Payment outcomes (simulated): [D-34, R-10]**
  - Card and UPI payments return a **random** result: **success**, **failure**, **cancelled** or **timed out**. Each has a clear message.
  - **Designated test values** (specific test card numbers and UPI IDs) force each outcome, so it can be reproduced.
- **Order creation: [D-39, R-09]**
  - Tapping Pay creates an **Awaiting Payment** order. Prices are locked and stock is held.
  - **Success** → **Placed**, and the bag is cleared (or, for Buy Now, left untouched).
  - **Failure, cancel or timeout** → Orders shows "Payment pending – Retry" for a configurable window (about 15 minutes). The bag is untouched, and every retry is tied to the same order.
  - **Unpaid after the window** → **Failed**, and the stock is released.
  - **COD** goes straight to **Placed**.
  - A customer can have **only one** Awaiting Payment order at a time.
- **On success:** the confirmation page shows:
  - order number and items
  - **amount paid**, or **amount payable on delivery** for COD
  - delivery address and expected delivery

### 6.12 Orders, delivery & tracking
**Order details** show:
- order number and order date
- items, variants and quantities
- prices and discounts
- payment information
- delivery address
- the status timeline
- **per-item after-sale states**

**Order status (one fulfilment timeline per order): [R-03, R-13]**
- Main path: **Awaiting Payment → Placed → Confirmed → Packed → Shipped → Out for Delivery → Delivered**.
  - *Placed* means payment succeeded or COD was accepted.
  - *Confirmed* means the store accepted the order (simulated).
- Other order statuses:
  - **Failed:** payment never completed.
  - **Cancelled:** every item was cancelled.
  - **Rejected at Delivery:** the customer refused the parcel.
  - **Delivery Attempt Failed** and **Returned to Origin**.
- Statuses **advance automatically** on a configurable timer, so the full flow can be seen in one session. Progression pauses at Out for Delivery for the OTP handover. **[D-35, T-61]**

**Item after-sale states: [R-03, R-13]**
- **Cancellation:** Cancelled → Refund Initiated → Refunded.
- **Return:** Return Requested → Return Approved → Pickup Scheduled → Picked Up → Refund Initiated → Refunded.
- **Return Rejected:** the reason is shown, and the return can't be requested again.
- **Pickup Failed:** the pickup is retried once. If it fails again, the return becomes **Return Closed**, with the reason shown.
- The order's headline status is derived from these, for example "Delivered · 1 item returned".

**Delivery OTP handover: [D-38, D-41]**
- Every order, whatever the payment method, has a **4-digit delivery OTP** in its **order details**.
- The customer shares the OTP with the delivery person at handover.
- In V1 there is no delivery-partner integration, so the delivery person is played by a **labelled "Delivery simulator"** on the order page. Once the order is Out for Delivery, the simulator lets the delivery person:
  - **enter the OTP**, which marks the order **Delivered**, starts the return window and makes the customer eligible to review; or
  - record that the customer **rejected the parcel**, which sets **Rejected at Delivery**. COD orders owe nothing. Prepaid orders are refunded (§6.13).
- If no handover happens within a configurable window:
  - the order becomes **Delivery Attempt Failed** and is re-attempted once
  - if the re-attempt also fails, the order becomes **Returned to Origin** and is refunded

**Other order information:**
- **Tracking:** the timeline plus a simulated courier name and tracking ID. **[T-14]**
- **Expected delivery dates:** these come from predefined delivery times per pincode zone. **[T-17]**
- **Invoice:**
  - A GST-style invoice that the customer can view and download.
  - Each category has a configured tax rate.
  - It is labelled **"Sample invoice — not a tax document"**.
  - **[T-15, R-35]**
- **Status changes:** shown **in-app** on the order page, with an indicator on Orders. No email or SMS. **[T-13]**
- All status, payment and tracking information comes from the system of record.

### 6.13 Cancellations, returns & refunds
- Each item shows whether it can be **cancelled** or **returned**. Exchanges are out of scope for V1. **[T-7, T-34]**
- **Cancel:**
  - Allowed at **Awaiting Payment, Placed, Confirmed or Packed**.
  - Not allowed from **Shipped** onwards.
  - The refund starts immediately.
  - **[R-14]**
- **Return:**
  - Allowed for **14 days after Delivered**, on **returnable** products only.
  - **Non-returnable categories:** innerwear, lingerie, beauty and personal care, and infant hygiene and feeding items. Each product carries a returnability flag, shown on its product page.
  - The customer picks a reason, reviews the item and submits. They then see the return status and pickup information.
  - Return outcomes are random (approved, rejected or pickup failed), with deterministic test overrides.
  - **[T-8, R-17, T-61, R-10]**
- **Refund amount: [R-04]**
  - Order-level discounts (coupon, bank offer) are **pro-rated across items by item value**. An item's refund is its actual paid share.
  - The delivery charge is refunded only when the **whole order** is cancelled, rejected at delivery or returned to origin.
  - The delivery charge is never clawed back when a partial refund drops the order below the free-delivery threshold.
- **Refund destination: [T-11, R-04, R-05]**
  - Refunds go to the original methods **in this order: card/UPI first, then gift card, then credits**, each up to what it paid.
  - COD-paid amounts are refunded to **credits**.
  - A refund to an **expired** gift card goes to credits.
- **Refund timing: [R-15]**
  - The refund starts on cancellation or on successful pickup.
  - It reaches **Refunded** on the next timer step.
- **Stock:** cancelled, failed, rejected-at-delivery, returned-to-origin and returned items go **back into stock**. Demo stock is also reset periodically. **[R-16]**
- Actions that aren't valid for the item's current state are blocked.
- Eligibility, windows, amounts and statuses are always decided by the system of record.
- Every step has clear confirmation and error messages.

## 7. Product rules & constraints (non-negotiable)

1. **The system of record is the source of truth.** It owns:
   - availability, prices, inventory
   - discounts, coupons, offers, taxes
   - credits, gift card balances, final amounts
   - user data, order and payment status, permissions
2. **No stale data on important actions.** Data is re-checked on every important action, and any change is explained to the customer.
3. **Strict data privacy.** A customer can only ever see or change their own:
   - profile, orders, wishlist
   - addresses, cards, credits, gift cards
   - reviews
4. **Payment safety:**
   - no duplicate orders or incorrect charges, including on retries and timeouts
   - only one Awaiting Payment order per customer **[R-09]**
   - only masked card data stored or shown
5. **Login gates:**
   - Guests can browse and use the bag and wishlist.
   - Placing an order and all account sections require login.
6. **Complete UI states.** Every screen and action has loading, empty, success and error states, with clear messages.
7. **Responsive and accessible.** See the quality targets in §8.
8. **Clean, modern and consistent.** Good spacing and a consistent visual style throughout.
9. **Content is configurable.** These can all be changed through data, without rebuilding UI:
   - catalogue hierarchy
   - Shop by Category cards, banners and popular searches
   - coupons, the bank offer, delivery and tax settings
10. **Demo honesty.** The site is labelled as a demo and never processes real money or real personal payment data. **[R-01]**

## 8. Quality targets [R-27, R-28]

- **Accessibility:** WCAG 2.1 AA.
- **Browsers:** the latest 2 versions of Chrome, Safari, Firefox and Edge.
- **Layouts:** verified at 360, 768, 1024 and 1280 px widths.
- **Performance:** Core Web Vitals "good" thresholds on mid-range mobile over 4G (LCP < 2.5s, INP < 200ms, CLS < 0.1).

## 9. In scope for V1

- Landing page with hero carousel, bank-offer tile, Shop by Category and footer (including policy pages)
- Header, mega menu and mobile navigation
- Browsing sections, categories and subcategories, plus Best Seller Styles
- Search with suggestions and typo tolerance
- Filters, sorting and infinite scroll on all listing pages
- Product detail page, including pincode check, offers and recommendations
- Ratings and reviews, with images and basic moderation
- Accounts:
  - sign-up and login with email or phone plus password
  - logout
  - password reset via security question
  - session handling
- Bag and wishlist for guests and logged-in customers, merged on login
- Profile sections: Orders, Wishlist, Gift Cards, Credits, Saved Cards, Saved Addresses, Edit Profile, Contact Us, Logout
- Map-first address selection with manual entry
- Coupons and the bank offer
- Payment by card, UPI, gift card, credits and COD:
  - card and UPI outcomes are simulated, with deterministic test overrides
  - the system creates an Awaiting Payment order and retries go against it
- Order confirmation, order history and detail, status timeline, delivery OTP with simulator, tracking, invoice
- Item-level cancellation, return and refund flows
- Demo labelling
- Responsive web for desktop, tablet and mobile

## 10. Explicitly out of scope for V1

- Admin, seller or back-office dashboards
- OTP for login or sign-up, phone or email verification, and social login. *(The delivery handover OTP is separate — D-41.)*
- Real payment processing or a payment gateway
- Net banking and wallet payment methods
- Buying gift cards
- Exchanges
- Account deletion as a self-service feature. *(Customers can request deletion through Contact Us.)*
- Native Android and iOS apps
- All AI features: AI assistance, AI recommendations, AI search and virtual try-on
- Live delivery-partner integration and real-time tracking
- Multi-vendor or marketplace functionality
- Real-time support or chat, and support replies
- International shopping and multi-currency (V1 is **India-only, in INR** — T-35)
- Advanced loyalty and rewards systems, advanced analytics, marketing automation
- Email, SMS and other complex notifications
- Category-specific filters and "helpful" votes on reviews
- **Anything outside the core customer shopping journey**

## 11. Success looks like

A customer on any device can:
- find what they want, by browsing, the mega menu or search
- trust what they see: accurate prices, stock and offers
- finish a purchase smoothly
- follow, cancel or return that order

They are never blocked by outdated information and never see anything that belongs to someone else.

**V1 acceptance:**
- the core journey works end to end without errors at all §8 widths and in all §8 browsers
- every scripted payment and return outcome can be reproduced with test values
- §8 quality targets are met

**[T-51, R-10, R-28]**

## 12. Accepted risks [R-11]

| Risk | Why accepted | Mitigation |
|---|---|---|
| Account takeover via a guessed security answer. | The owner chose the security question as the only recovery method, with no OTP or email (D-2). | Predefined questions; answers ignore case and spaces; 5 attempts, then a 15-minute lockout; neutral responses; in-app notice after a reset. |
| Registration with someone else's email or phone. | Identifiers are not verified (D-1). | Uniqueness rules; neutral messages; no data shared between accounts. |
| Sign-up reveals that an email or phone is already registered. | Uniqueness requires telling the customer (D-42). | Rate limits on sign-up and login; neutral login and reset responses. |
| Repeat sign-ups to collect starter credits. | The owner chose credits for every sign-up (D-43). The site is a demo with no real money. | Sign-up rate limits; credits have no cash value. |
| Customers typing real card numbers. | The site is a public demo. | Prominent warning; only test card numbers accepted; full numbers and CVV never stored. |

## 13. Open questions

**None.**
- **D-41 (delivery OTP):** this decision records the owner's choice. The OTP is in the order details and the customer shares it with the delivery person. The **"Delivery simulator"**, which plays the delivery person, and the **missed-handover handling** come from the R-02 recommendation. Both are needed because V1 has no delivery partner. The owner can change either.

New questions found in later phases will be added here.

---

## 14. Owner decisions log

| # | Decision | Resolves |
|---|---|---|
| D-1 | Customers sign up and log in with an **email address or a phone number**, plus a password. Identifiers are not verified. | OQ-1 |
| D-2 | The security question is used **only** to set a new password when the customer has forgotten it. | OQ-2 |
| D-3 | **Guests can add items to the bag** (and use the wishlist, D-30). They must **log in or sign up to place an order**. The guest bag merges on login. | OQ-3 |
| D-4 | The landing-page coupon tile **is** the HDFC bank offer. Clicking it opens the listing of eligible products, with filters already applied. | OQ-4 |
| D-9 | Payment is **simulated**. The customer selects a method and the simulation returns a result. No real money is processed. *Outcomes refined by D-34.* | OQ-9 |
| D-12 | Orders follow a simulated progression: Placed → Confirmed → Packed → Shipped → Out for Delivery → Delivered. Reviews are allowed **only after Delivered**. | OQ-12 |
| D-16 | Delivery charges, taxes and pincode serviceability use **predefined values / configuration**. | OQ-16 |
| D-22 | Product images come from **open-source images that are free to use**. | OQ-22 |
| D-23 | Sign-up uses either email or phone, but **a phone number is mandatory to place an order**. | OQ-53 |
| D-24 | **Cash on delivery** is in V1. *Handover extended to all orders by D-38 and D-41.* | OQ-9 |
| D-25 | Payment methods are **cards, UPI, credits, COD** and **gift cards** (D-32). Net banking and wallets are dropped. | OQ-54 |
| D-26 | ~~Taxes are added at checkout.~~ **Superseded by D-36.** | — |
| D-27 | **Free delivery when the bag value is greater than ₹1,999.** | OQ-16 |
| D-28 | Brand names are left to the team, which will use **fictional brand names**. | OQ-22 |
| D-29 | Card payment needs **name on card, card number, expiry and CVV** for a new card. | OQ-40 |
| D-30 | **Guests can use the wishlist.** In a bag merge, **quantities of the same item are added together**. | OQ-52 |
| D-31 | The checkout phone number is **saved to the customer's account** (subject to R-08). | OQ-53 |
| D-32 | **Gift cards are a separate payment method**, and **credits can be combined with another method**. | OQ-54 |
| D-33 | "Which card" means a **saved card**. The payment screen **warns customers not to enter real card details**. | OQ-40 |
| D-34 | Payment outcomes are **random**: success, failure, cancelled or timed out. | OQ-54 |
| D-35 | Statuses **advance automatically**. Returns and refunds are simulated by status updates. | OQ-55 |
| D-36 | **All displayed prices include tax**. The tax portion is shown for information only. | Q-1 |
| D-37 | **No guest checkout.** | Q-2 |
| D-38 | **Every order**, whatever the payment method, is completed by a **4-digit delivery OTP** handover. | Q-3 |
| D-39 | Order creation uses the **Awaiting Payment** model. | OQ-49 |
| D-41 | The delivery OTP is shown **in the order details**, and the customer **shares it with the delivery person**. | R-02 |
| D-42 | Password reset: the customer **chooses their question from the full list** and answers it. Sign-up revealing a taken identifier is an accepted risk. | SQ-1 |
| D-43 | **No pre-made demo accounts.** Every new sign-up gets **starter credits** (abuse risk accepted). Personal data is **purged after 30 days of inactivity**, and deletion requests are fulfilled through that purge. *Supersedes R-31's demo-account part.* | SQ-2 |
| D-44 | **Catalogue size:** at least 6 products per subcategory, at least 48 per category listing, about 1,800–2,500 products, 2–4 licensed images each. | SQ-3 |

## 15. Review resolutions (owner-approved, 2026-10-06)

The owner approved the recommended option for every finding. The one exception is R-02, which is covered by D-41.

| # | Resolution |
|---|---|
| R-01 | V1 is a **publicly accessible showcase**, clearly labelled as a demo, with no real transactions. §1 now says "production-quality *experience*". |
| R-02 | See D-41. The Delivery simulator and missed-handover handling are recorded in §6.12. |
| R-03 | **One fulfilment timeline per order**, plus per-item after-sale states. The order's headline status is derived from them. |
| R-04 | Order-level discounts are **pro-rated** across items. Delivery is refunded only on whole-order cancellation, rejection or return to origin. Refunds go to card/UPI → gift card → credits. |
| R-05 | Gift cards are **redeemed into the account** and selected at payment. A refund to an expired gift card goes to credits. |
| R-06 | Credits and/or one gift card, plus **at most one** of card, UPI or COD, all applied at the payment step. A ₹0 remainder skips the simulation. |
| R-07 | The bank offer applies to **eligible items' value**. It is previewed in the bag and applied when an HDFC card is selected, before Pay. |
| R-08 | Email and phone are **unique across accounts**. A conflicting checkout phone is used for that order only. |
| R-09 | **One Awaiting Payment order per customer.** Checking out again offers Retry or Cancel. |
| R-10 | Random outcomes, with **deterministic test values** that force each one. |
| R-11 | Security-question recovery is recorded as an **accepted risk**, with mitigations (§12). |
| R-12 | Password at least 8 characters with a letter and a number. 5 failed logins → 15-minute lockout. Neutral messages. |
| R-13 | Full status model with transitions (§6.12). A failed pickup is retried once. A rejected return shows its reason and can't be re-requested. |
| R-14 | Cancellation is allowed at Awaiting Payment, Placed, Confirmed and Packed. |
| R-15 | A refund starts on cancellation or successful pickup, and completes on the next timer step. |
| R-16 | Cancelled, failed, rejected and returned items go back into stock. Demo stock is reset periodically. |
| R-17 | Whole categories are non-returnable, with a flag per product. The footer says "Easy 14-day returns on eligible items". |
| R-18 | Only logged-in customers can report. Hidden after 3 reports, including images. Image type and size are limited. |
| R-19 | Terms, Privacy, Returns & Refunds and Shipping policy pages, with labelled placeholder text. Account deletion can be requested via Contact Us. |
| R-20 | Seeded sample reviews back every rating. They don't carry the Verified Purchase badge. |
| R-21 | A guest's pincode is entered once and remembered on the device for the product page and bag. |
| R-22 | After logging in from a prompt, the interrupted action continues. |
| R-23 | Map-first with "Enter address manually" always visible. The map provider is chosen in the architecture phase. |
| R-24 | 6-digit pincode format plus the serviceability list. Unserviceable addresses can be saved but not used for delivery. |
| R-25 | Coupons are configured with: code, type, cap, minimum value, eligible categories, validity dates and per-customer limit. A coupon that becomes ineligible is removed automatically with a message. |
| R-26 | Vague wording replaced with measurable rules: typo tolerance, filter persistence, and "graceful" handling as a specific message plus a disabled action. |
| R-27 | WCAG 2.1 AA. The latest 2 versions of the major browsers. Breakpoints at 360, 768, 1024 and 1280 px. |
| R-28 | Core Web Vitals "good" thresholds on mid-range mobile over 4G. |
| R-29 | Suggestions from 2 characters, up to 8. Search within a category is search with the category filter applied. Recent searches can be cleared. |
| R-30 | Recommended is the default sort, with documented weights. Products have a listing date for What's New. |
| R-31 | ~~Starter credits go only to pre-made demo accounts.~~ **Superseded by D-43.** A published list of demo gift card codes is still provided, each redeemable once per account. |
| R-32 | A logged-in bag and wishlist sync across devices. The device starts with an empty guest bag after logout. Wishlist duplicates are removed on merge. |
| R-33 | Cross-section cards use a filtered all-products listing. Products have an inclusive-sizing tag. |
| R-34 | Best Seller Styles is reached from a hero carousel slide and is included in scope. |
| R-35 | Tax rate per category. The invoice is labelled "Sample invoice — not a tax document". |
| R-36 | A glossary was added (§4). |
| R-37 | Engineering guidance moved to the Appendix. Customer-visible structures, such as URLs and data-driven content, stay in the product requirements. |
| R-38 | The carousel autoplays every 5s, pauses on hover and focus, has visible controls and holds at most 8 slides. Slides are set in configuration. |

## 16. Team decisions (owner may override)

| # | Decision |
|---|---|
| T-5 | URLs include the section (§6.1). |
| T-6 | Every Shop by Category card is in the catalogue. Headphones, speakers and wearables sit under Gen Z → Gadgets. Men gains Activewear. Office Wear and Workwear become one card. "Inclusive Styles" is merged into "Size-Inclusive Styles". |
| T-7 | Exchanges are out of scope for V1. |
| T-8 | Returns are allowed for 14 days after delivery. Non-returnable categories as in §6.13 (R-17). |
| T-10 | Demo gift card codes are provided. Starter credits come from the sign-up grant (D-43). Credits are also earned from refunds. |
| T-11 | Refunds go to the original methods (R-04). COD refunds go to credits. |
| T-13 | Status changes are shown in-app only. |
| T-14 | Tracking is the timeline plus a simulated courier name and tracking ID. |
| T-15 | A GST-style invoice that can be viewed and downloaded, labelled as a sample (R-35). |
| T-16 | Free delivery is measured on the bag value after product discounts and coupon. Below the threshold, a configurable flat charge applies. |
| T-17 | Delivery dates come from predefined delivery times per pincode zone. |
| T-18 | One coupon per order, stacking with product discounts and the bank offer. Order of application: product discount → coupon → bank offer → delivery → credits / gift card → amount to pay. Prices include tax throughout. |
| T-19 | Reviews: one per customer per product, rating-only allowed, up to 5 images, blocked-word check, reporting (R-18). |
| T-20 | Infinite scroll with scroll restore. Recent searches per device or account. Popular searches are curated. |
| T-21 | Rule-based recommendations. Bought together and complete the look are curated. |
| T-22 | The team writes sample catalogue data, including sample reviews (R-20), in the volume set by D-44. Brand names are fictional (D-28). |
| T-23 | Password reset rules (§6.7). |
| T-24 | Configurable session length and inactivity timeout. No "remember me". The customer returns to the same page after re-login. |
| T-25 | Edit Profile fields and the current-password rule (§6.8). Account deletion is not self-service. |
| T-26 | The wishlist saves products. Move to Bag asks for a size, then removes the item from the wishlist. |
| T-27 | Up to 10 per item, or stock if lower. |
| T-28 | Buy Now checks out only that item and leaves the bag untouched. |
| T-29 | Products can appear in several sections. Breadcrumbs follow the customer's path. |
| T-30 | A working brand name and logo placeholder are used until the owner supplies the real ones. |
| T-31 | Search bar on desktop. Full-screen search on mobile. |
| T-32 | Slide-out menu on mobile and tablet. |
| T-33 | Logout lands on the landing page. |
| T-34 | Cancellations and returns are per item. |
| T-35 | India only, INR only. |
| T-36 | Single seller. |
| T-37 | A support request gets an ID and the status "Submitted". There are no replies. |
| T-38 | Placeholder pages and sample company details, clearly labelled. |
| T-39 | Data-driven content is a product requirement. The tech stack is chosen later. |
| T-41 | Account holders are 18+, confirmed at sign-up. |
| T-42 | Manual address entry is available when the map is unavailable. |
| T-44 | Best Seller Styles is a curated listing, with best sellers flagged in catalogue data. |
| T-46 | Out-of-stock products are labelled and listed last. Products with no ratings show no rating badge. |
| T-48 | Stock is held while an order is Awaiting Payment and released when it becomes Failed. |
| T-50 | Size, rating and in-stock filters are added. |
| T-51 | V1 acceptance as in §11. |
| T-57 | Merged quantities are capped at stock or the item limit, with a message. Guest data is kept for 30 days. |
| T-59 | Combination rules (superseded in detail by R-06). COD has a configurable maximum order value. |
| T-60 | Saved card needs only the CVV. "Save this card" option. Masked storage only. Test card numbers only. |
| T-61 | Configurable status timer. Random return outcomes with test overrides (R-10). |

---

## Appendix — Engineering guidelines for later phases [R-37]

These are the owner's standing instructions for implementation. They are not product behaviour.
- Don't add unnecessary libraries.
- Don't duplicate existing functionality.
- Don't create fake APIs where real ones exist.
- Don't modify unrelated parts of the application.
- Keep merchandising and catalogue content in data, not in UI code. This covers category cards, banners, coupons and offers.
