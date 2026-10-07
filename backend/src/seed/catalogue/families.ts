import type { BrandGroup } from './brands.js';

/** Size systems. Prices are the same across sizes unless `priceStep` is set on the family. */
export const SIZES = {
  apparelMen: ['S', 'M', 'L', 'XL', 'XXL'],
  apparelWomen: ['XS', 'S', 'M', 'L', 'XL'],
  apparelInclusive: ['XL', 'XXL', '3XL', '4XL'],
  waistMen: ['28', '30', '32', '34', '36', '38'],
  waistWomen: ['26', '28', '30', '32', '34'],
  kids: ['2-3Y', '4-5Y', '6-7Y', '8-9Y', '10-11Y', '12-13Y'],
  infant: ['0-3M', '3-6M', '6-12M', '12-18M', '18-24M'],
  shoesMen: ['UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11'],
  shoesWomen: ['UK 3', 'UK 4', 'UK 5', 'UK 6', 'UK 7', 'UK 8'],
  shoesKids: ['UK 10C', 'UK 12C', 'UK 1', 'UK 3', 'UK 5'],
  bra: ['32B', '34B', '34C', '36B', '36C', '38C'],
  bedding: ['Single', 'Double', 'Queen', 'King'],
  diapers: ['NB', 'S', 'M', 'L', 'XL'],
  freeSize: ['Free Size'],
  vol50: ['50 ml', '100 ml'],
  vol180: ['180 ml', '340 ml'],
  vol200: ['200 ml', '400 ml'],
  vol150: ['150 ml'],
  oneSize: ['One Size'],
} as const;
export type SizeSystem = keyof typeof SIZES;

export interface Family {
  key: string;
  brandGroup: BrandGroup;
  /** Price band in rupees. */
  price: [number, number];
  /** Max discount %, used to draw a realistic discount. */
  maxDiscount: number;
  sizeGuide?: string;
  /** Style words combined with the item noun to make product names. */
  styles: string[];
  materials: string[];
  colours: string[];
  details: string[];
  care: string;
  specs: (r: (xs: readonly string[]) => string) => [string, string][];
  /** Share of products that get extra colours of the same style ("More colours"). */
  colourSiblings?: number;
  /** Optional size-dependent pricing: each larger size adds this fraction. */
  priceStep?: number;
  bankOfferShare: number;
}

const APPAREL_COLOURS = ['Black', 'White', 'Navy', 'Olive', 'Maroon', 'Beige', 'Grey Melange', 'Sky Blue', 'Charcoal', 'Mustard', 'Teal', 'Rust'];
const WOMEN_COLOURS = ['Black', 'White', 'Blush Pink', 'Lavender', 'Mint', 'Coral', 'Navy', 'Maroon', 'Cream', 'Emerald', 'Mustard', 'Powder Blue'];
const ETHNIC_COLOURS = ['Maroon', 'Mustard', 'Ivory', 'Royal Blue', 'Emerald', 'Peach', 'Magenta', 'Teal', 'Rani Pink', 'Off White', 'Gold'];
const NEUTRALS = ['Black', 'Brown', 'Tan', 'White', 'Navy', 'Grey', 'Olive'];
const METALS = ['Gold-Toned', 'Silver-Toned', 'Rose Gold-Toned', 'Oxidised Silver'];
const HOME_COLOURS = ['Natural Wood', 'Walnut', 'White', 'Grey', 'Beige', 'Teal', 'Mustard', 'Terracotta', 'Sage Green', 'Charcoal'];
const SHADES = ['Nude', 'Rosewood', 'Berry', 'Coral', 'Classic Red', 'Mauve', 'Peach', 'Plum', 'Caramel', 'Ivory', 'Sand', 'Honey'];
const NONE = ['Assorted'];

const pickSpec = (k: string, xs: readonly string[]) => (r: (xs: readonly string[]) => string): [string, string] => [k, r(xs)];

const apparelSpecs = (fits: string[], necks: string[]) => (r: (xs: readonly string[]) => string): [string, string][] => [
  pickSpec('Fit', fits)(r),
  pickSpec('Neck / Collar', necks)(r),
  pickSpec('Sleeve', ['Short Sleeves', 'Long Sleeves', 'Three-Quarter Sleeves', 'Sleeveless'])(r),
  pickSpec('Pattern', ['Solid', 'Printed', 'Striped', 'Checked', 'Self Design'])(r),
  pickSpec('Occasion', ['Casual', 'Everyday', 'Weekend', 'Work', 'Party'])(r),
];

export const FAMILIES: Record<string, Family> = {
  top: {
    key: 'top', brandGroup: 'fashion', price: [399, 1999], maxDiscount: 65,
    styles: ['Slim Fit', 'Regular Fit', 'Relaxed Fit', 'Classic', 'Essential', 'Textured', 'Washed', 'Premium'],
    materials: ['Cotton', 'Pure Cotton', 'Cotton Blend', 'Linen Blend', 'Organic Cotton', 'Jersey'],
    colours: APPAREL_COLOURS, details: ['Round Neck', 'Polo Collar', 'Spread Collar', 'Henley Neck', 'V-Neck', 'Mandarin Collar'],
    care: 'Machine wash cold with similar colours. Do not bleach. Tumble dry low. Warm iron if needed.',
    specs: apparelSpecs(['Slim Fit', 'Regular Fit', 'Relaxed Fit'], ['Round Neck', 'Polo Collar', 'Spread Collar', 'V-Neck']),
    colourSiblings: 0.3, bankOfferShare: 0.4,
  },
  outer: {
    key: 'outer', brandGroup: 'fashion', price: [1499, 5999], maxDiscount: 60,
    styles: ['Quilted', 'Lightweight', 'Tailored', 'Hooded', 'Padded', 'Classic', 'Utility', 'Cropped'],
    materials: ['Polyester', 'Nylon', 'Denim', 'Wool Blend', 'Cotton Twill', 'Fleece', 'Faux Leather'],
    colours: ['Black', 'Olive', 'Navy', 'Tan', 'Charcoal', 'Khaki', 'Maroon', 'Bottle Green'],
    details: ['Zip Front', 'Button Front', 'Stand Collar', 'Notch Lapel', 'Hooded'],
    care: 'Dry clean recommended. If washing, use cold water on a gentle cycle and line dry in shade.',
    specs: (r) => [['Fit', r(['Regular Fit', 'Slim Fit', 'Relaxed Fit'])], ['Closure', r(['Zip', 'Buttons', 'Snap Buttons'])], ['Lining', r(['Lined', 'Unlined'])], ['Occasion', r(['Casual', 'Winter', 'Work', 'Travel'])]],
    colourSiblings: 0.2, bankOfferShare: 0.7,
  },
  bottom: {
    key: 'bottom', brandGroup: 'fashion', price: [699, 2999], maxDiscount: 60,
    styles: ['Slim Fit', 'Straight Fit', 'Tapered', 'Relaxed Fit', 'Skinny Fit', 'Wide Leg', 'Mid-Rise', 'High-Rise'],
    materials: ['Stretchable Denim', 'Cotton', 'Cotton Twill', 'Linen Blend', 'Polyester Blend', 'Knit'],
    colours: ['Indigo', 'Black', 'Light Blue', 'Khaki', 'Olive', 'Navy', 'Grey', 'Beige', 'Charcoal'],
    details: ['Mid-Rise', 'High-Rise', 'Elasticated Waist', 'Drawstring', 'Clean Look', 'Light Fade'],
    care: 'Machine wash cold inside out. Wash dark colours separately. Do not tumble dry.',
    specs: (r) => [['Fit', r(['Slim Fit', 'Straight Fit', 'Tapered', 'Relaxed Fit'])], ['Rise', r(['Mid-Rise', 'High-Rise', 'Low-Rise'])], ['Length', r(['Regular', 'Cropped', 'Ankle Length'])], ['Closure', r(['Button and Zip', 'Drawstring', 'Elasticated'])]],
    colourSiblings: 0.25, bankOfferShare: 0.4,
  },
  dress: {
    key: 'dress', brandGroup: 'women', price: [799, 3999], maxDiscount: 65,
    styles: ['Flared', 'A-Line', 'Wrap', 'Tiered', 'Fit and Flare', 'Smocked', 'Ruched', 'Pleated'],
    materials: ['Georgette', 'Crepe', 'Rayon', 'Cotton', 'Satin', 'Viscose', 'Linen Blend'],
    colours: WOMEN_COLOURS, details: ['Floral Print', 'Solid', 'Polka Dots', 'Abstract Print', 'Embellished', 'Tie-Up Detail'],
    care: 'Hand wash cold or dry clean. Do not wring. Dry in shade. Low iron.',
    specs: (r) => [['Shape', r(['A-Line', 'Bodycon', 'Wrap', 'Fit and Flare', 'Straight'])], ['Length', r(['Mini', 'Midi', 'Maxi', 'Knee Length'])], ['Neck', r(['V-Neck', 'Sweetheart', 'Round Neck', 'Square Neck'])], ['Occasion', r(['Party', 'Casual', 'Brunch', 'Evening'])]],
    colourSiblings: 0.25, bankOfferShare: 0.5,
  },
  ethnic: {
    key: 'ethnic', brandGroup: 'ethnic', price: [699, 4999], maxDiscount: 70,
    styles: ['Embroidered', 'Printed', 'Block Print', 'Chikankari', 'Zari Work', 'Bandhani', 'Ikat', 'Straight'],
    materials: ['Cotton', 'Rayon', 'Silk Blend', 'Chanderi', 'Georgette', 'Khadi', 'Linen'],
    colours: ETHNIC_COLOURS, details: ['Mandarin Collar', 'Round Neck', 'V-Neck', 'Thread Work', 'Mirror Work', 'Gota Patti'],
    care: 'Dry clean recommended for the first wash. Hand wash separately in cold water afterwards.',
    specs: (r) => [['Work', r(['Embroidered', 'Printed', 'Woven', 'Zari'])], ['Length', r(['Knee Length', 'Calf Length', 'Ankle Length'])], ['Occasion', r(['Festive', 'Wedding', 'Daily', 'Puja'])], ['Sleeve', r(['Three-Quarter Sleeves', 'Long Sleeves', 'Short Sleeves'])]],
    colourSiblings: 0.2, bankOfferShare: 0.5,
  },
  occasionEthnic: {
    key: 'occasionEthnic', brandGroup: 'ethnic', price: [2999, 19999], maxDiscount: 60,
    styles: ['Embroidered', 'Zari Woven', 'Sequinned', 'Brocade', 'Handloom', 'Banarasi', 'Kanjeevaram-Inspired'],
    materials: ['Silk Blend', 'Art Silk', 'Georgette', 'Velvet', 'Organza', 'Net'],
    colours: ETHNIC_COLOURS, details: ['Heavy Border', 'Stone Work', 'Sequin Work', 'Woven Design'],
    care: 'Dry clean only. Store folded in a muslin cloth.',
    specs: (r) => [['Work', r(['Zari', 'Sequin', 'Embroidery', 'Woven'])], ['Occasion', r(['Wedding', 'Festive', 'Reception'])], ['Includes', r(['Main garment with blouse piece', 'Main garment only', 'Set with dupatta'])]],
    bankOfferShare: 0.8,
  },
  intimate: {
    key: 'intimate', brandGroup: 'intimate', price: [249, 1499], maxDiscount: 50,
    styles: ['Seamless', 'Everyday', 'Breathable', 'Soft-Touch', 'Lightly Padded', 'Comfort Fit'],
    materials: ['Cotton Spandex', 'Modal', 'Micro Modal', 'Cotton', 'Nylon Spandex'],
    colours: ['Black', 'Nude', 'White', 'Grey Melange', 'Navy', 'Blush'], details: ['Pack of 1', 'Pack of 2', 'Pack of 3', 'Tagless'],
    care: 'Hand wash or machine wash on delicate in a laundry bag. Do not tumble dry.',
    specs: (r) => [['Pack', r(['Pack of 1', 'Pack of 2', 'Pack of 3'])], ['Waistband', r(['Inner Elastic', 'Outer Elastic', 'Seamless'])], ['Coverage', r(['Full', 'Medium', 'Low'])]],
    bankOfferShare: 0.1,
  },
  sleep: {
    key: 'sleep', brandGroup: 'intimate', price: [499, 2499], maxDiscount: 55,
    styles: ['Printed', 'Checked', 'Striped', 'Solid', 'Cosy', 'Breathable'],
    materials: ['Cotton', 'Flannel', 'Modal', 'Rayon', 'Satin'], colours: ['Navy', 'Grey', 'Pink', 'Lavender', 'Mint', 'Charcoal', 'Sky Blue'],
    details: ['Button Front', 'Drawstring', 'Elasticated Waist', 'With Pockets'],
    care: 'Machine wash cold. Tumble dry low. Do not bleach.',
    specs: (r) => [['Pattern', r(['Printed', 'Checked', 'Striped', 'Solid'])], ['Set', r(['Top and Bottom', 'Single Piece'])], ['Length', r(['Full Length', 'Shorts', 'Three-Quarter'])]],
    bankOfferShare: 0.2,
  },
  active: {
    key: 'active', brandGroup: 'active', price: [499, 2999], maxDiscount: 60,
    styles: ['Dry-Fit', 'Training', 'Running', 'Seamless', 'Compression', 'Breathable Mesh'],
    materials: ['Polyester', 'Polyester Spandex', 'Nylon Spandex', 'Recycled Polyester'],
    colours: ['Black', 'Charcoal', 'Neon Green', 'Royal Blue', 'Red', 'White', 'Olive'], details: ['Quick Dry', 'Reflective Detail', 'Zip Pocket', 'Anti-Odour'],
    care: 'Machine wash cold. Do not use fabric softener. Line dry.',
    specs: (r) => [['Activity', r(['Running', 'Training', 'Yoga', 'Gym'])], ['Technology', r(['Quick Dry', 'Moisture Wicking', 'Anti-Odour'])], ['Fit', r(['Slim Fit', 'Regular Fit', 'Compression'])]],
    bankOfferShare: 0.4,
  },
  shoes: {
    key: 'shoes', brandGroup: 'footwear', price: [999, 5999], maxDiscount: 55,
    styles: ['Lace-Up', 'Slip-On', 'Chunky', 'Minimal', 'Cushioned', 'Lightweight', 'Classic', 'Retro'],
    materials: ['Mesh', 'Synthetic Leather', 'Genuine Leather', 'Suede', 'Canvas', 'Knit'],
    colours: ['White', 'Black', 'Tan', 'Grey', 'Navy', 'Brown', 'Off White', 'Beige'], details: ['Cushioned Footbed', 'Padded Collar', 'Textured Sole', 'Contrast Sole'],
    care: 'Wipe with a clean, dry cloth. Do not machine wash. Air dry away from direct heat.',
    specs: (r) => [['Sole', r(['Rubber', 'EVA', 'TPR', 'Phylon'])], ['Closure', r(['Lace-Up', 'Slip-On', 'Velcro', 'Buckle'])], ['Toe Shape', r(['Round Toe', 'Pointed Toe', 'Square Toe'])], ['Occasion', r(['Casual', 'Sports', 'Formal', 'Party'])]],
    colourSiblings: 0.25, bankOfferShare: 0.7,
  },
  sandals: {
    key: 'sandals', brandGroup: 'footwear', price: [399, 2499], maxDiscount: 55,
    styles: ['Strappy', 'Comfort', 'Slide', 'Platform', 'Block Heel', 'Flat', 'Embellished'],
    materials: ['Synthetic', 'PU', 'Genuine Leather', 'Rubber', 'Faux Suede'], colours: ['Tan', 'Black', 'Gold', 'Nude', 'White', 'Brown', 'Silver'],
    details: ['Cushioned Footbed', 'Buckle Detail', 'Anti-Skid Sole', 'Ankle Strap'],
    care: 'Wipe clean with a damp cloth. Keep away from prolonged water exposure.',
    specs: (r) => [['Sole', r(['Rubber', 'TPR', 'EVA'])], ['Heel', r(['Flat', 'Block Heel', 'Wedge', 'Stiletto'])], ['Occasion', r(['Casual', 'Party', 'Everyday'])]],
    bankOfferShare: 0.3,
  },
  bag: {
    key: 'bag', brandGroup: 'accessories', price: [699, 4999], maxDiscount: 60,
    styles: ['Structured', 'Quilted', 'Textured', 'Minimal', 'Woven', 'Croc-Embossed', 'Classic'],
    materials: ['PU', 'Genuine Leather', 'Canvas', 'Nylon', 'Jute'], colours: ['Black', 'Tan', 'Beige', 'Maroon', 'Olive', 'Off White', 'Brown', 'Pastel Pink'],
    details: ['Zip Closure', 'Magnetic Snap', 'Detachable Strap', 'Multiple Compartments'],
    care: 'Wipe with a soft dry cloth. Stuff with paper when not in use to keep the shape.',
    specs: (r) => [['Closure', r(['Zip', 'Magnetic Snap', 'Flap', 'Drawstring'])], ['Compartments', r(['1', '2', '3', '4'])], ['Strap', r(['Fixed', 'Detachable', 'Adjustable'])]],
    colourSiblings: 0.2, bankOfferShare: 0.5,
  },
  jewellery: {
    key: 'jewellery', brandGroup: 'accessories', price: [299, 2999], maxDiscount: 70,
    styles: ['Minimal', 'Statement', 'Layered', 'Kundan', 'Temple', 'Floral', 'Geometric', 'Pearl'],
    materials: ['Brass', 'Alloy', 'Sterling Silver', 'Stainless Steel'], colours: METALS,
    details: ['Stone-Studded', 'Pearl Detail', 'Enamelled', 'Hammered Finish', 'Plain'],
    care: 'Avoid contact with water, perfume and lotions. Store in a dry pouch.',
    specs: (r) => [['Plating', r(['Gold-Plated', 'Rhodium-Plated', 'Rose Gold-Plated', 'Oxidised'])], ['Stone', r(['None', 'Kundan', 'Cubic Zirconia', 'Faux Pearl'])], ['Occasion', r(['Everyday', 'Festive', 'Party', 'Wedding'])]],
    bankOfferShare: 0.2,
  },
  watch: {
    key: 'watch', brandGroup: 'accessories', price: [999, 9999], maxDiscount: 60,
    styles: ['Analogue', 'Minimal', 'Multifunction', 'Chronograph', 'Skeleton', 'Classic', 'Sport'],
    materials: ['Stainless Steel', 'Leather Strap', 'Silicone Strap', 'Mesh Strap'], colours: ['Black', 'Silver', 'Gold', 'Rose Gold', 'Brown', 'Navy'],
    details: ['Water Resistant', 'Date Display', 'Luminous Hands', 'Sapphire-Coated Glass'],
    care: 'Avoid magnets and hot water. Wipe with a soft cloth.',
    specs: (r) => [['Display', r(['Analogue', 'Digital', 'Analogue-Digital'])], ['Water Resistance', r(['30 m', '50 m', '100 m'])], ['Dial Shape', r(['Round', 'Square', 'Rectangle'])], ['Warranty', r(['1 Year', '2 Years'])]],
    bankOfferShare: 0.8,
  },
  smartwatch: {
    key: 'smartwatch', brandGroup: 'gadgets', price: [1999, 14999], maxDiscount: 60,
    styles: ['AMOLED', 'Fitness', 'Calling', 'Rugged', 'Slim', 'Round Dial'],
    materials: ['Silicone Strap', 'Metal Strap', 'Nylon Strap'], colours: ['Black', 'Silver', 'Rose Gold', 'Olive', 'Blue'],
    details: ['Bluetooth Calling', 'SpO2 Monitor', '7-Day Battery', 'GPS'],
    care: 'Keep away from extreme heat. Charge with the supplied cable only.',
    specs: (r) => [['Display', r(['1.43" AMOLED', '1.85" HD', '1.32" Round AMOLED'])], ['Battery Life', r(['Up to 5 days', 'Up to 7 days', 'Up to 10 days'])], ['Water Resistance', r(['IP67', 'IP68', '5 ATM'])], ['Warranty', r(['1 Year'])]],
    bankOfferShare: 0.9,
  },
  eyewear: {
    key: 'eyewear', brandGroup: 'accessories', price: [599, 3499], maxDiscount: 65,
    styles: ['Polarised', 'UV-Protected', 'Gradient', 'Mirrored', 'Classic', 'Retro'],
    materials: ['Metal Frame', 'Acetate Frame', 'TR90 Frame'], colours: ['Black', 'Gold', 'Gunmetal', 'Tortoise', 'Silver', 'Brown'],
    details: ['UV400 Protection', 'Polarised Lenses', 'Spring Hinges'],
    care: 'Clean with the provided microfibre cloth. Store in the case.',
    specs: (r) => [['Lens', r(['Polarised', 'UV400', 'Gradient', 'Mirrored'])], ['Frame', r(['Full Rim', 'Rimless', 'Half Rim'])], ['Frame Material', r(['Metal', 'Acetate', 'TR90'])]],
    bankOfferShare: 0.4,
  },
  smallAccessory: {
    key: 'smallAccessory', brandGroup: 'accessories', price: [199, 1499], maxDiscount: 60,
    styles: ['Classic', 'Textured', 'Reversible', 'Woven', 'Printed', 'Minimal'],
    materials: ['Genuine Leather', 'PU', 'Cotton', 'Wool Blend', 'Polyester', 'Viscose'], colours: NEUTRALS,
    details: ['Pack of 1', 'Pack of 3', 'Adjustable', 'Reversible'],
    care: 'Spot clean only.',
    specs: (r) => [['Pack', r(['Pack of 1', 'Pack of 2', 'Pack of 3'])], ['Pattern', r(['Solid', 'Printed', 'Striped', 'Checked'])]],
    bankOfferShare: 0.1,
  },
  kidsWear: {
    key: 'kidsWear', brandGroup: 'kids', price: [299, 1499], maxDiscount: 60,
    styles: ['Printed', 'Graphic', 'Striped', 'Solid', 'Cartoon', 'Dino Print', 'Floral', 'Colour-Block'],
    materials: ['Pure Cotton', 'Cotton Blend', 'Organic Cotton', 'Fleece', 'Denim'], colours: ['Yellow', 'Sky Blue', 'Pink', 'Red', 'Navy', 'Green', 'Lilac', 'Orange'],
    details: ['Round Neck', 'Snap Buttons', 'Elasticated Waist', 'Pocket Detail'],
    care: 'Machine wash cold with similar colours. Do not bleach.',
    specs: (r) => [['Pattern', r(['Printed', 'Solid', 'Striped', 'Graphic'])], ['Occasion', r(['Casual', 'Play', 'Party', 'School'])], ['Sleeve', r(['Short Sleeves', 'Long Sleeves', 'Sleeveless'])]],
    colourSiblings: 0.2, bankOfferShare: 0.2,
  },
  kidsShoes: {
    key: 'kidsShoes', brandGroup: 'kids', price: [499, 2499], maxDiscount: 50,
    styles: ['Velcro', 'Light-Up', 'Lace-Up', 'Slip-On', 'Cushioned', 'Classic'], materials: ['Mesh', 'Synthetic', 'Canvas', 'PU'],
    colours: ['Navy', 'Pink', 'Black', 'White', 'Red', 'Blue'], details: ['Velcro Strap', 'Anti-Skid Sole', 'Padded Collar'],
    care: 'Wipe with a damp cloth. Air dry.',
    specs: (r) => [['Closure', r(['Velcro', 'Lace-Up', 'Slip-On'])], ['Sole', r(['Rubber', 'EVA', 'TPR'])]],
    bankOfferShare: 0.2,
  },
  toy: {
    key: 'toy', brandGroup: 'toys', price: [299, 2999], maxDiscount: 50,
    styles: ['Classic', 'Deluxe', 'Mini', 'Learning', 'Junior', 'Creative', 'Adventure'],
    materials: ['BPA-Free Plastic', 'Wood', 'Plush Fabric', 'Cardboard', 'ABS Plastic'], colours: NONE,
    details: ['Ages 3+', 'Ages 5+', 'Ages 8+', 'Ages 1+'],
    care: 'Wipe clean with a damp cloth. Keep small parts away from children under 3.',
    specs: (r) => [['Age Group', r(['1-3 Years', '3-5 Years', '5-8 Years', '8+ Years'])], ['Pieces', r(['1', '24', '48', '100', '250'])], ['Skill', r(['Motor Skills', 'Problem Solving', 'Creativity', 'Imagination'])]],
    bankOfferShare: 0.3,
  },
  school: {
    key: 'school', brandGroup: 'school', price: [149, 1499], maxDiscount: 45,
    styles: ['Printed', 'Classic', 'Ergonomic', 'Compact', 'Character', 'Leak-Proof'],
    materials: ['Polyester', 'BPA-Free Plastic', 'Stainless Steel', 'Paper', 'Canvas'], colours: ['Blue', 'Pink', 'Green', 'Red', 'Purple', 'Yellow'],
    details: ['Water Resistant', 'Padded Straps', 'Insulated', 'Pack of 6'],
    care: 'Wipe clean. Hand wash bottles and boxes before first use.',
    specs: (r) => [['Capacity', r(['500 ml', '750 ml', '20 L', '25 L', 'A4', 'A5'])], ['Age Group', r(['3-6 Years', '6-10 Years', '10+ Years'])]],
    bankOfferShare: 0.1,
  },
  babyCare: {
    key: 'babyCare', brandGroup: 'kids', price: [199, 1999], maxDiscount: 35,
    styles: ['Gentle', 'Ultra-Soft', 'Natural', 'Hypoallergenic', 'Everyday'], materials: ['Silicone', 'BPA-Free Plastic', 'Cotton', 'Plant-Based'],
    colours: NONE, details: ['Dermatologically Tested', 'Pack of 2', 'Paraben-Free', 'BPA-Free'],
    care: 'Follow the instructions on the pack.',
    specs: (r) => [['Age Group', r(['0-6 Months', '6-12 Months', '0-24 Months'])], ['Pack Size', r(['Pack of 1', 'Pack of 2', 'Pack of 60', 'Pack of 84'])]],
    bankOfferShare: 0.1,
  },
  furniture: {
    key: 'furniture', brandGroup: 'home', price: [2999, 39999], maxDiscount: 60,
    styles: ['Mid-Century', 'Scandinavian', 'Industrial', 'Classic', 'Modern', 'Rustic', 'Compact'],
    materials: ['Sheesham Wood', 'Engineered Wood', 'Mango Wood', 'Metal', 'Teak Finish'], colours: HOME_COLOURS,
    details: ['Easy Assembly', 'With Storage', 'Foldable', 'Ready to Assemble'],
    care: 'Wipe with a dry cloth. Keep away from direct sunlight and moisture.',
    specs: (r) => [['Material', r(['Solid Wood', 'Engineered Wood', 'Metal'])], ['Assembly', r(['DIY', 'Carpenter Assembly', 'Pre-Assembled'])], ['Warranty', r(['1 Year', '3 Years'])]],
    bankOfferShare: 0.9,
  },
  decor: {
    key: 'decor', brandGroup: 'home', price: [299, 3999], maxDiscount: 65,
    styles: ['Handcrafted', 'Boho', 'Minimal', 'Vintage', 'Abstract', 'Floral', 'Geometric'],
    materials: ['Ceramic', 'Metal', 'MDF', 'Glass', 'Terracotta', 'Jute', 'Wax'], colours: HOME_COLOURS,
    details: ['Set of 1', 'Set of 2', 'Set of 3', 'Wall Mounted', 'Tabletop'],
    care: 'Dust regularly with a soft dry cloth.',
    specs: (r) => [['Material', r(['Ceramic', 'Metal', 'Wood', 'Glass'])], ['Set', r(['Set of 1', 'Set of 2', 'Set of 3'])], ['Placement', r(['Living Room', 'Bedroom', 'Office', 'Entrance'])]],
    bankOfferShare: 0.3,
  },
  furnishing: {
    key: 'furnishing', brandGroup: 'home', price: [499, 4999], maxDiscount: 65,
    styles: ['Printed', 'Woven', 'Embroidered', 'Solid', 'Ikat', 'Floral', 'Geometric'],
    materials: ['Cotton', 'Polyester', 'Microfibre', 'Jute', 'Velvet'], colours: HOME_COLOURS,
    details: ['Set of 2', 'Single Piece', '180 TC', '220 TC'],
    care: 'Machine wash gentle in cold water. Do not bleach.',
    specs: (r) => [['Material', r(['Cotton', 'Polyester', 'Microfibre'])], ['Thread Count', r(['144 TC', '180 TC', '210 TC', '300 TC'])], ['Pattern', r(['Printed', 'Solid', 'Woven'])]],
    bankOfferShare: 0.4,
  },
  kitchen: {
    key: 'kitchen', brandGroup: 'kitchen', price: [199, 3999], maxDiscount: 55,
    styles: ['Non-Stick', 'Stainless Steel', 'Classic', 'Stackable', 'Airtight', 'Hand-Painted', 'Minimal'],
    materials: ['Stainless Steel', 'Ceramic', 'Borosilicate Glass', 'Aluminium', 'Melamine', 'Copper'], colours: ['Silver', 'Black', 'White', 'Teal', 'Red', 'Assorted'],
    details: ['Set of 2', 'Set of 4', 'Set of 6', 'Dishwasher Safe', 'Induction Friendly'],
    care: 'Hand wash recommended. Dry thoroughly before storing.',
    specs: (r) => [['Material', r(['Stainless Steel', 'Ceramic', 'Glass', 'Aluminium'])], ['Set', r(['Set of 1', 'Set of 2', 'Set of 4', 'Set of 6'])], ['Dishwasher Safe', r(['Yes', 'No'])]],
    bankOfferShare: 0.3,
  },
  lighting: {
    key: 'lighting', brandGroup: 'home', price: [799, 5999], maxDiscount: 60,
    styles: ['Industrial', 'Modern', 'Rattan', 'Minimal', 'Vintage', 'Globe'], materials: ['Metal', 'Rattan', 'Glass', 'Fabric Shade', 'Wood'],
    colours: ['Black', 'Gold', 'White', 'Natural', 'Brass'], details: ['Warm White', 'E27 Holder', 'LED Compatible'],
    care: 'Switch off and unplug before cleaning. Dust with a dry cloth.',
    specs: (r) => [['Bulb', r(['E27', 'B22', 'Integrated LED'])], ['Light Colour', r(['Warm White', 'Cool White'])], ['Bulb Included', r(['Yes', 'No'])]],
    bankOfferShare: 0.5,
  },
  bath: {
    key: 'bath', brandGroup: 'home', price: [299, 2499], maxDiscount: 60,
    styles: ['Plush', 'Quick-Dry', 'Textured', 'Anti-Skid', 'Minimal', 'Printed'], materials: ['Cotton', 'Microfibre', 'Bamboo', 'Polyester', 'Stainless Steel'],
    colours: ['White', 'Grey', 'Teal', 'Beige', 'Navy', 'Pink'], details: ['Set of 2', 'Single Piece', '500 GSM', 'Rust Proof'],
    care: 'Machine wash warm. Tumble dry low.',
    specs: (r) => [['Material', r(['Cotton', 'Microfibre', 'Bamboo', 'Steel'])], ['Set', r(['Set of 1', 'Set of 2', 'Set of 4'])]],
    bankOfferShare: 0.2,
  },
  homeUtility: {
    key: 'homeUtility', brandGroup: 'home', price: [149, 2999], maxDiscount: 50,
    styles: ['Heavy-Duty', 'Compact', 'Multi-Purpose', 'Eco', 'Ergonomic', 'Foldable'], materials: ['Plastic', 'Microfibre', 'Steel', 'Natural Fibre'],
    colours: ['Assorted', 'Grey', 'Blue', 'Green', 'White'], details: ['Pack of 1', 'Pack of 2', 'Refill Included'],
    care: 'Rinse and dry after use.',
    specs: (r) => [['Pack', r(['Pack of 1', 'Pack of 2', 'Pack of 3'])], ['Use', r(['Floor', 'Kitchen', 'Bathroom', 'All-Purpose'])]],
    bankOfferShare: 0.1,
  },
  appliance: {
    key: 'appliance', brandGroup: 'appliances', price: [999, 7999], maxDiscount: 50,
    styles: ['Compact', 'Digital', 'Turbo', 'Pro', 'Smart', 'Classic'], materials: ['Stainless Steel', 'ABS Plastic'],
    colours: ['Black', 'White', 'Silver', 'Red'], details: ['1 Year Warranty', '2 Year Warranty', 'Auto Shut-Off'],
    care: 'Unplug before cleaning. Wipe the outer body with a dry cloth.',
    specs: (r) => [['Power', r(['750 W', '1000 W', '1200 W', '1500 W'])], ['Capacity', r(['1.2 L', '1.5 L', '3.5 L', '4.2 L'])], ['Warranty', r(['1 Year', '2 Years'])]],
    bankOfferShare: 0.9,
  },
  beauty: {
    key: 'beauty', brandGroup: 'beauty', price: [149, 1999], maxDiscount: 45,
    styles: ['Matte', 'Dewy', 'Hydrating', 'Long-Wear', 'Lightweight', 'Brightening', 'Nourishing', 'Oil-Control'],
    materials: ['Vitamin C', 'Hyaluronic Acid', 'Niacinamide', 'Shea Butter', 'Aloe Vera', 'Rose Water', 'Argan Oil'], colours: SHADES,
    details: ['Paraben-Free', 'Cruelty-Free', 'Dermatologically Tested', 'Vegan'],
    care: 'Store in a cool, dry place. For external use only. Patch test before first use.',
    specs: (r) => [['Skin Type', r(['All Skin Types', 'Oily', 'Dry', 'Combination', 'Sensitive'])], ['Finish', r(['Matte', 'Dewy', 'Natural', 'Satin'])], ['Key Ingredient', r(['Vitamin C', 'Niacinamide', 'Hyaluronic Acid', 'Shea Butter'])]],
    priceStep: 0.6, bankOfferShare: 0.2,
  },
  fragrance: {
    key: 'fragrance', brandGroup: 'fragrance', price: [399, 4999], maxDiscount: 45,
    styles: ['Woody', 'Floral', 'Fresh', 'Oriental', 'Citrus', 'Musky', 'Aquatic'], materials: ['Eau de Parfum', 'Eau de Toilette', 'Body Mist', 'Attar'],
    colours: NONE, details: ['Long Lasting', 'Travel Size', 'Gift Pack'],
    care: 'Store away from direct sunlight and heat.',
    specs: (r) => [['Fragrance Family', r(['Woody', 'Floral', 'Fresh', 'Oriental'])], ['Concentration', r(['EDP', 'EDT', 'Body Mist', 'Attar'])]],
    priceStep: 0.7, bankOfferShare: 0.4,
  },
  beautyTool: {
    key: 'beautyTool', brandGroup: 'tools', price: [299, 4999], maxDiscount: 50,
    styles: ['Ionic', 'Ceramic', 'Cordless', 'Travel', 'Professional', 'Rechargeable'], materials: ['Ceramic', 'Titanium', 'Stainless Steel', 'Synthetic Bristles'],
    colours: ['Black', 'Pink', 'White', 'Rose Gold'], details: ['1 Year Warranty', 'Temperature Control', 'USB Charging'],
    care: 'Unplug and let cool before storing. Clean with a dry cloth.',
    specs: (r) => [['Power', r(['Corded', 'Cordless', 'USB Rechargeable'])], ['Warranty', r(['6 Months', '1 Year', '2 Years'])]],
    bankOfferShare: 0.6,
  },
  gadget: {
    key: 'gadget', brandGroup: 'gadgets', price: [499, 9999], maxDiscount: 65,
    styles: ['Wireless', 'Bass Boosted', 'Noise Cancelling', 'Compact', 'Fast Charging', 'Rugged'], materials: ['ABS Plastic', 'Silicone', 'Aluminium'],
    colours: ['Black', 'White', 'Blue', 'Beige', 'Lilac', 'Green'], details: ['Bluetooth 5.3', '30 h Playback', 'Type-C Charging', 'IPX5'],
    care: 'Keep away from water unless rated. Charge with a certified cable.',
    specs: (r) => [['Connectivity', r(['Bluetooth 5.3', 'Bluetooth 5.0', 'Wired', 'Type-C'])], ['Battery', r(['20 h', '30 h', '40 h', 'Not applicable'])], ['Warranty', r(['6 Months', '1 Year'])]],
    bankOfferShare: 0.9,
  },
  lifestyle: {
    key: 'lifestyle', brandGroup: 'lifestyle', price: [149, 1499], maxDiscount: 50,
    styles: ['Aesthetic', 'Pastel', 'Retro', 'Minimal', 'Quirky', 'Holographic'], materials: ['Ceramic', 'Vinyl', 'Stainless Steel', 'Acrylic', 'Wood'],
    colours: ['Pastel', 'Black', 'White', 'Multicolour', 'Sage'], details: ['Set of 1', 'Pack of 10', 'Pack of 25', 'Gift Ready'],
    care: 'Wipe clean.', specs: (r) => [['Pack', r(['Single', 'Pack of 10', 'Pack of 25'])], ['Material', r(['Vinyl', 'Ceramic', 'Steel', 'Acrylic'])]],
    bankOfferShare: 0.1,
  },
};
