/**
 * Image relevance (owner decision after the S3 spot-check): a photo is used for a product only if
 * its title names the product type. Keywords come from the item's head noun plus synonyms.
 */

/** Synonyms by head noun (lower-case, singular). The head noun itself always counts. */
const SYNONYMS: Record<string, string[]> = {
  't-shirt': ['t shirt', 'tshirt', 'tee', 't-shirt'], shirt: ['shirt'], polo: ['polo'], hoodie: ['hoodie', 'hooded'], sweatshirt: ['sweatshirt', 'jumper', 'pullover'],
  jacket: ['jacket', 'parka', 'windbreaker'], blazer: ['blazer', 'suit jacket'], coat: ['coat', 'overcoat', 'trench'], top: ['top', 'blouse', 'crop top', 'tank top'],
  'tank top': ['tank top', 'vest top', 'singlet'], jeans: ['jeans', 'denim'], trousers: ['trousers', 'pants', 'slacks'], chinos: ['chinos', 'chino', 'trousers'],
  shorts: ['shorts'], joggers: ['joggers', 'sweatpants', 'track pants'], 'track pants': ['track pants', 'tracksuit', 'sweatpants', 'joggers'], cargos: ['cargo'],
  sneakers: ['sneaker', 'trainer', 'shoe'], shoe: ['shoe', 'footwear', 'sneaker', 'boot', 'loafer', 'oxford'], sandal: ['sandal', 'chappal', 'kolhapuri'],
  slipper: ['slipper', 'flip flop', 'flip-flop', 'chappal'], boot: ['boot'], loafer: ['loafer', 'moccasin'], heel: ['heel', 'stiletto', 'pump'], flat: ['flats', 'ballet', 'jutti', 'mojari'], wedge: ['wedge'],
  kurta: ['kurta', 'kurti'], 'kurta set': ['kurta'], sherwani: ['sherwani', 'achkan'], 'nehru jacket': ['nehru', 'jacket', 'waistcoat'], dhoti: ['dhoti', 'veshti', 'mundu', 'lungi'],
  'ethnic jacket': ['jacket', 'waistcoat', 'ethnic'], saree: ['saree', 'sari'], lehenga: ['lehenga', 'ghagra', 'choli'], 'salwar suit': ['salwar', 'kameez', 'churidar'],
  'ethnic dress': ['anarkali', 'dress', 'gown'], dupatta: ['dupatta', 'stole', 'shawl', 'scarf'], blouse: ['blouse', 'choli'], palazzos: ['palazzo', 'pants'],
  dress: ['dress', 'gown', 'frock'], jumpsuit: ['jumpsuit', 'romper', 'overall'], 'co-ord sets': ['co ord', 'coord', 'matching set', 'two piece', 'outfit'],
  skirt: ['skirt'], leggings: ['leggings', 'tights'], sweater: ['sweater', 'cardigan', 'jumper', 'knit'], frock: ['frock', 'dress'],
  bra: ['bra', 'brassiere', 'lingerie'], panties: ['panties', 'knickers', 'underwear', 'briefs'], shapewear: ['shapewear', 'corset', 'girdle'], camisole: ['camisole', 'cami'], slip: ['slip dress', 'petticoat'],
  briefs: ['briefs', 'underwear'], boxers: ['boxers', 'boxer shorts', 'underwear'], trunks: ['trunks', 'underwear'], vest: ['vest', 'undershirt', 'singlet'], thermals: ['thermal', 'long johns', 'base layer'],
  'night suits': ['pajama', 'pyjama', 'nightwear', 'sleepwear'], pyjamas: ['pajama', 'pyjama'], 'lounge pants': ['lounge', 'pajama', 'pyjama', 'sweatpants'], robe: ['robe', 'bathrobe', 'dressing gown'], 'lounge sets': ['lounge', 'pajama', 'pyjama'], nightwear: ['pajama', 'pyjama', 'nightwear', 'nightgown'],
  bag: ['bag', 'handbag', 'purse', 'tote', 'backpack', 'satchel'], 'tote bag': ['tote', 'bag'], 'shoulder bag': ['bag', 'handbag', 'purse'], 'sling bag': ['sling', 'bag', 'crossbody'], backpack: ['backpack', 'rucksack', 'bag'],
  clutch: ['clutch', 'purse', 'evening bag'], wallet: ['wallet', 'purse'], 'crossbody bag': ['crossbody', 'bag', 'purse'], 'school bag': ['school bag', 'backpack', 'schoolbag'],
  earring: ['earring', 'jhumka'], necklace: ['necklace', 'pendant', 'chain'], bracelet: ['bracelet', 'bangle', 'kada'], ring: ['ring'], anklet: ['anklet', 'payal'],
  'hair accessories': ['hair clip', 'hairpin', 'hair band', 'headband', 'scrunchie', 'hair accessory'], 'jewellery sets': ['jewellery', 'jewelry', 'necklace'], chain: ['chain', 'necklace'],
  watch: ['watch', 'wristwatch'], smartwatch: ['smartwatch', 'smart watch', 'fitness tracker', 'wearable'], sunglasses: ['sunglasses', 'shades', 'eyewear'], aviators: ['aviator', 'sunglasses'], wayfarers: ['sunglasses', 'wayfarer'],
  belt: ['belt'], 'scarves & stoles': ['scarf', 'stole', 'shawl'], 'caps & hats': ['cap', 'hat', 'beanie'], cap: ['cap', 'baseball cap'], 'bucket hat': ['bucket hat', 'hat'], socks: ['socks', 'sock'],
  bodysuit: ['bodysuit', 'onesie', 'romper', 'baby'], romper: ['romper', 'onesie', 'baby'], 'newborn clothing': ['baby', 'newborn', 'infant'], 'baby dress': ['baby', 'dress', 'frock'],
  'feeding essentials': ['feeding bottle', 'baby bottle', 'sippy', 'bib'], diapers: ['diaper', 'nappy', 'nappies'], 'baby skincare': ['baby lotion', 'baby oil', 'baby powder', 'baby soap'],
  'soft toys': ['teddy', 'plush', 'stuffed toy', 'soft toy', 'stuffed animal'], doll: ['doll'], 'action figures': ['action figure', 'figurine', 'toy'], puzzle: ['puzzle', 'jigsaw'],
  'building blocks': ['blocks', 'lego', 'building'], 'educational toys': ['toy', 'educational'], 'board games': ['board game', 'chess', 'ludo', 'carrom'], 'outdoor toys': ['toy', 'ball', 'swing', 'kite'], 'pretend play': ['toy', 'play kitchen', 'doctor set'],
  'lunch box': ['lunch box', 'lunchbox', 'tiffin', 'bento'], 'water bottle': ['water bottle', 'bottle', 'flask'], notebook: ['notebook', 'diary', 'notepad'], stationery: ['pen', 'pencil', 'stationery', 'crayon', 'eraser'], 'pencil case': ['pencil case', 'pencil box', 'pouch'],
  'school uniforms': ['school uniform', 'uniform'], 'ethnic wear': ['kurta', 'ethnic', 'lehenga', 'sherwani', 'traditional'],
  sofa: ['sofa', 'couch', 'settee'], bed: ['bed', 'bedroom'], table: ['table'], chair: ['chair', 'armchair', 'stool'], 'study table': ['desk', 'study table', 'table'], wardrobe: ['wardrobe', 'closet', 'armoire', 'almirah'],
  cabinet: ['cabinet', 'cupboard', 'sideboard'], shelf: ['shelf', 'shelves', 'bookcase', 'bookshelf'], 'side table': ['side table', 'end table', 'nightstand', 'table'],
  'wall art': ['painting', 'wall art', 'canvas', 'artwork', 'frame'], mirror: ['mirror'], vase: ['vase'], plant: ['plant', 'houseplant', 'succulent'], planter: ['planter', 'pot', 'flowerpot'],
  candle: ['candle', 'diya'], 'photo frame': ['photo frame', 'picture frame', 'frame'], clock: ['clock'], cushion: ['cushion', 'pillow'], curtain: ['curtain', 'drape'], rug: ['rug', 'carpet', 'dhurrie'],
  carpet: ['carpet', 'rug'], mattress: ['mattress', 'bed'], bedsheet: ['bedsheet', 'bed sheet', 'bedding', 'bed linen'], blanket: ['blanket', 'throw', 'quilt'], quilt: ['quilt', 'comforter', 'razai', 'duvet'], pillow: ['pillow'],
  cookware: ['cookware', 'pan', 'pot', 'kadai', 'wok', 'saucepan'], 'kitchen tools': ['kitchen', 'utensil', 'spatula', 'ladle', 'knife'], 'dinner sets': ['dinner set', 'plates', 'crockery', 'dinnerware', 'tableware'],
  plate: ['plate'], bowl: ['bowl'], glass: ['glass', 'tumbler'], mug: ['mug', 'cup'], bottle: ['bottle', 'flask'], 'storage containers': ['container', 'jar', 'storage'], 'spice box': ['spice', 'masala dabba'],
  organiser: ['organiser', 'organizer', 'storage'], basket: ['basket'], 'laundry storage': ['laundry', 'hamper', 'basket'], 'storage box': ['storage box', 'box', 'crate'],
  'table lamp': ['lamp', 'table lamp'], 'floor lamp': ['floor lamp', 'lamp'], 'ceiling light': ['ceiling light', 'chandelier', 'pendant light', 'lamp', 'light fixture'], 'wall light': ['wall light', 'sconce', 'lamp'], 'decorative lights': ['fairy lights', 'string lights', 'lantern', 'lamp', 'diwali lights'],
  towel: ['towel'], 'bath mat': ['bath mat', 'mat'], 'shower curtain': ['shower curtain', 'shower'], 'bathroom accessories': ['bathroom', 'soap dish', 'toothbrush holder'], 'bathroom storage': ['bathroom', 'shelf', 'cabinet'],
  'tool kits': ['tool', 'toolkit', 'screwdriver', 'hammer', 'wrench'], hardware: ['hardware', 'screw', 'hinge', 'drill', 'tool'], wallpaper: ['wallpaper'],
  kettle: ['kettle'], 'mixers & grinders': ['mixer', 'grinder', 'blender'], iron: ['iron', 'clothes iron'], 'air fryer': ['air fryer', 'fryer'],
  mop: ['mop'], broom: ['broom', 'jhadu'], 'vacuum cleaner': ['vacuum'], 'cleaning liquids': ['detergent', 'cleaner', 'cleaning'], brush: ['brush'], 'air freshener': ['air freshener', 'freshener', 'diffuser'],
  foundation: ['foundation', 'makeup'], concealer: ['concealer', 'makeup'], compact: ['compact', 'powder', 'makeup'], blush: ['blush', 'blusher', 'makeup'], highlighter: ['highlighter', 'makeup'], bronzer: ['bronzer', 'makeup'],
  lipstick: ['lipstick', 'lip'], 'lip gloss': ['lip gloss', 'gloss', 'lip'], 'lip balm': ['lip balm', 'lip'], eyeliner: ['eyeliner', 'kohl', 'kajal'], kajal: ['kajal', 'kohl', 'eyeliner'], mascara: ['mascara'],
  eyeshadow: ['eyeshadow', 'eye shadow', 'palette'], 'makeup brushes': ['makeup brush', 'brushes', 'brush'], 'makeup kits': ['makeup', 'cosmetics'], 'lip products': ['lipstick', 'lip', 'gloss'],
  'face wash': ['face wash', 'cleanser', 'facewash'], cleanser: ['cleanser', 'face wash'], toner: ['toner'], serum: ['serum'], moisturiser: ['moisturiser', 'moisturizer', 'cream', 'lotion'], sunscreen: ['sunscreen', 'sunblock', 'spf'],
  'face masks': ['face mask', 'sheet mask', 'clay mask'], exfoliator: ['exfoliator', 'scrub'], 'acne care': ['acne', 'skincare', 'cream'], 'eye care': ['eye cream', 'eye'], 'skincare essentials': ['skincare', 'serum', 'cream', 'moisturizer', 'sunscreen'],
  shampoo: ['shampoo'], conditioner: ['conditioner'], 'hair oil': ['hair oil', 'oil'], 'hair serum': ['serum', 'hair'], 'hair colour': ['hair dye', 'hair color', 'henna', 'mehndi'], 'hair masks': ['hair mask'], 'styling products': ['gel', 'wax', 'hairspray', 'pomade'],
  perfume: ['perfume', 'fragrance', 'cologne', 'scent'], deodorant: ['deodorant', 'antiperspirant'], 'body mist': ['body mist', 'mist', 'spray', 'perfume'], attar: ['attar', 'ittar', 'perfume oil', 'perfume'],
  'body lotion': ['lotion', 'body lotion', 'cream'], 'body wash': ['body wash', 'shower gel', 'soap'], 'hand care': ['hand cream', 'hand'], 'foot care': ['foot', 'pedicure'], scrub: ['scrub'], 'bath products': ['bath', 'soap', 'bath salt', 'bath bomb'],
  'feminine hygiene': ['sanitary', 'pad', 'menstrual'], 'hand sanitisers': ['sanitiser', 'sanitizer'], 'cotton & wipes': ['cotton', 'wipes', 'cotton pad'],
  'shaving products': ['shaving', 'shave'], razor: ['razor', 'shaver'], 'beard care': ['beard'], trimmer: ['trimmer', 'clipper'], 'grooming kits': ['grooming', 'shaving kit'],
  toothbrush: ['toothbrush'], toothpaste: ['toothpaste'], mouthwash: ['mouthwash'], 'dental floss': ['floss', 'dental'],
  'hair dryer': ['hair dryer', 'hairdryer', 'blow dryer'], straightener: ['straightener', 'flat iron'], 'curling iron': ['curling iron', 'curler'], 'facial tools': ['facial', 'roller', 'gua sha'], 'makeup applicators': ['sponge', 'applicator', 'beauty blender'],
  headphones: ['headphone', 'earphone', 'earbuds', 'speaker', 'headset'], 'phone accessory': ['phone case', 'charger', 'cable', 'power bank', 'phone'], 'desk decor': ['desk', 'stationery', 'organizer', 'lamp'], 'sticker pack': ['sticker', 'badge', 'pin'],
};

/** Titles about events or public figures are never product photos. */
const EVENT_WORDS = /\b(concert|premiere|award|minister|president|election|rally|parade|match|race|jockey|festival of|conference|ceremony|protest|politician|singer|actor|actress|wrestl|cricketer|footballer)\b/i;

const norm = (s: string) => ` ${s.toLowerCase().replace(/[_\-–—/,()]+/g, ' ').replace(/\s+/g, ' ').trim()} `;

/** Keywords for an item noun, e.g. "Casual Shirt" → ['shirt', …]. */
export function keywordsFor(noun: string): string[] {
  const lower = noun.toLowerCase();
  const head = lower.split(' ').at(-1)!.replace(/s$/, '');
  const fromFull = SYNONYMS[lower] ?? SYNONYMS[lower.replace(/s$/, '')] ?? [];
  const fromHead = SYNONYMS[head] ?? SYNONYMS[`${head}s`] ?? [];
  return [...new Set([lower, head, ...fromFull, ...fromHead])].filter((k) => k.length >= 3 || k === 'tee');
}

/** Whether a photo title names the item (word match, plural-tolerant) and isn't an event photo. */
export function isRelevant(title: string, keywords: readonly string[]): boolean {
  if (EVENT_WORDS.test(title)) return false;
  const t = norm(title);
  return keywords.some((k) => {
    const kw = norm(k).trim();
    return new RegExp(`\\s${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(s|es)?\\s`).test(t);
  });
}

/** Photos of events (concerts, awards, rallies…) usually show identifiable real people. */
export function isEventPhoto(title: string): boolean {
  return EVENT_WORDS.test(title);
}
