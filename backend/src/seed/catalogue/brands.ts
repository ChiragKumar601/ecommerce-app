/**
 * Fictional brand names (D-28), grouped by vertical. Invented for this demo; chosen to avoid
 * known retail brands.
 */
export const BRANDS = {
  fashion: ['Northlane', 'Urban Thread', 'Vestra', 'Mellow Mode', 'Rove & Rivet', 'Tidewear', 'Linen Lab', 'Kestrel Co.', 'Oakfield Basics', 'Driftline'],
  women: ['Kaira', 'Saffron Street', 'Elara Atelier', 'Mira Lane', 'Juniper Rose', 'Velvet Fig'],
  ethnic: ['Indigo Loom', 'Rangreza', 'Taanbaan', 'Kesariya', 'Chikan House', 'Banarasi Bloom'],
  active: ['Stridon', 'Pulse Athletics', 'Kinetiq', 'Trailborn'],
  intimate: ['Softwell', 'Comfy Cove', 'Daywear Lab'],
  footwear: ['Pacewalk', 'Cobble & Crest', 'Solemate Studio', 'Stepforth', 'Heelhaus'],
  accessories: ['Brass & Bloom', 'Glintwork', 'Timeline Co.', 'Shadewise', 'Carryall Co.', 'Tote Theory'],
  kids: ['Little Sprout', 'Tiny Tribe', 'Puddle Jump', 'Playnest', 'Crayon Kids'],
  toys: ['Wonderblock', 'Puzzleberry', 'Funfolk Toys', 'Brightbrain'],
  school: ['Inkwell Kids', 'Satchel & Co.'],
  home: ['Hearthly', 'Casa Ember', 'Teak & Thread', 'Nestwell Home', 'Lumen Lane', 'Clay & Kiln', 'Brightnest'],
  kitchen: ['Spice Route Kitchen', 'Cookwise', 'Tiffin & Co.'],
  appliances: ['Voltara', 'Kitchenix'],
  beauty: ['Dewdrop Beauty', 'Mitti & Rose', 'Glowfold', 'Kaya Botanics', 'Aurum Skin', 'Velour Cosmetics', 'Tinted Truth'],
  hair: ['Tressly', 'Curl Theory'],
  fragrance: ['Ittar Lane', 'Mistral Scents', 'Oud & Amber'],
  grooming: ['Barbersmith', 'Stubble Co.', 'Bladecraft'],
  oral: ['Pearlwhite', 'Mintly'],
  tools: ['Heatwave Pro', 'Glossy Tools'],
  gadgets: ['Wavesonic', 'Pulsebeat', 'Gadgetry', 'Tapwise'],
  genz: ['Neon Static', 'Off Script', 'Pixel Drift', 'Low Key Club', 'Main Character'],
  lifestyle: ['Desk Dept.', 'Sticker Shop Co.'],
} as const;

export type BrandGroup = keyof typeof BRANDS;
