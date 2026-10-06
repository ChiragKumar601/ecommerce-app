/**
 * Field validation messages. Texts marked §12 are taken verbatim from spec §12.
 * Texts marked UX cover secondary failures that §12 doesn't word (for example "too long").
 */
export const V = {
  name: 'Enter your name (2–60 letters)', // §12
  email: 'Enter a valid email address', // §12
  phone: 'Enter a valid 10-digit mobile number', // §12
  password: 'Use 8–64 characters with at least one letter and one number', // §12
  passwordMismatch: "Passwords don't match", // §12
  securityAnswer: 'Enter an answer (2–50 characters)', // §12
  ageConfirm: 'You must be 18 or older to create an account', // §12
  dateOfBirth: 'You must be 18 or older', // §12
  required: 'This field is required', // §12
  tooLong100: 'Use up to 100 characters', // UX
  city: 'Enter a city', // §12
  state: 'Select a state', // §12
  pincode: 'Enter a valid 6-digit pincode', // §12
  label: 'Enter a label', // §12
  cardNumber: 'Enter a valid card number', // §12
  nameOnCard: 'Enter the name on the card', // §12
  cardExpired: 'Card has expired', // §12
  cardExpiryFormat: 'Enter the expiry as MM/YY', // UX
  cvv: 'Enter a valid CVV', // §12
  upi: 'Enter a valid UPI ID', // §12
  coupon: 'Enter a valid coupon code', // §12
  giftCard: 'Enter a valid gift card code', // §12
  otp: 'Enter the 4-digit OTP', // §12
  reviewText: 'Reviews can be up to 2,000 characters', // §12
  returnComment: 'Comments can be up to 500 characters', // UX (§12 gives no message)
  supportMessage: 'Describe your issue (10–1,000 characters)', // §12
  rating: 'Choose a rating from 1 to 5', // UX
  search: 'Enter something to search for', // UX
} as const;
