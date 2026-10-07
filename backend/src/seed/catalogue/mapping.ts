import type { BrandGroup } from './brands.js';
import type { SizeSystem } from './families.js';

export type Gender = 'men' | 'women' | 'boys' | 'girls' | 'unisex' | 'infant' | 'none';

/** How one owned subcategory is generated. */
export interface SubcatPlan {
  family: string;
  sizes: SizeSystem;
  gender: Gender | 'mixed-men' | 'mixed-women';
  brandGroup?: BrandGroup;
  /** Price band override in rupees. */
  price?: [number, number];
  sizeGuide?: string;
  /** Singular item noun used in product names. */
  noun: string;
  /** Pexels search query (S3.7). */
  imageQuery: string;
  /** Name pattern: 'apparel' = style + material + noun; 'simple' = style + noun. */
  nameMode: 'apparel' | 'simple';
}

/** A subcategory that lists products generated elsewhere (T-29: products may sit in several sections). */
export interface MirrorRule {
  target: string;
  sources: string[];
  /** Restrict by product gender. */
  genders?: Gender[];
  /** Max products taken from the sources. */
  limit?: number;
}

const PLURAL_ONLY = new Set(['jeans', 'shorts', 'trousers', 'chinos', 'joggers', 'track pants', 'cargos', 'leggings', 'pyjamas', 'boxers', 'briefs', 'trunks', 'palazzos', 'tights', 'sunglasses', 'aviators', 'wayfarers', 'lounge pants', 'cargo pants', 'parachute pants', 'baggy jeans', 'panties', 'night suits', 'thermals', 'innerwear', 'nightwear', 'compression wear', 'gym shorts', 'diapers', 'stationery', 'hardware', 'wallpapers', 'feeding essentials', 'cotton & wipes', 'school uniforms', 'co-ord sets', 'lounge sets', 'kurta sets', 'salwar suits', 'jewellery sets', 'dinner sets', 'grooming kits', 'makeup kits', 'tool kits', 'stickers & badges', 'bath products', 'styling products', 'shaving products', 'beard care', 'hand care', 'foot care', 'acne care', 'eye care', 'skincare essentials', 'lip products', 'kitchen tools', 'hand sanitisers', 'feminine hygiene', 'desk decor', 'storage containers', 'phone accessories', 'headphones & speakers', 'watches & wearables', 'viral picks', 'new drops', 'bathroom accessories', 'bathroom storage', 'laundry storage', 'decorative lights', 'mixers & grinders', 'cleaning liquids', 'scarves & stoles', 'caps & hats', 'hair accessories', 'sweaters & sweatshirts', 'jackets & coats', 'makeup applicators', 'facial tools', 'educational toys', 'outdoor toys', 'pretend play', 'building blocks', 'soft toys', 'board games', 'action figures', 'ethnic wear', 'newborn clothing', 'baby skincare', 'personal care']);

/** "Casual Shirts" → "Casual Shirt"; plural-only items keep their name. */
export function singular(name: string): string {
  const lower = name.toLowerCase();
  if (PLURAL_ONLY.has(lower)) return name;
  if (/ies$/i.test(name) && !/hoodies$/i.test(name) && !/accessories$/i.test(name)) return name.replace(/ies$/i, 'y');
  if (/accessories$/i.test(name)) return name.replace(/ies$/i, 'y');
  if (/(ches|shes|sses|xes)$/i.test(name)) return name.replace(/es$/i, '');
  if (/s$/i.test(name) && !/ss$/i.test(name)) return name.replace(/s$/i, '');
  return name;
}

const g = (gender: SubcatPlan['gender']) => gender;

/**
 * Plan for an owned subcategory, chosen by path. Returns null for mirror-only subcategories.
 * Paths are `section/category/subcategory` slugs from tree.json.
 */
export function planFor(path: string, name: string): SubcatPlan | null {
  const [section, category, sub] = path.split('/') as [string, string, string];
  const noun = singular(name);
  const plan = (p: Omit<SubcatPlan, 'noun' | 'imageQuery' | 'nameMode'> & Partial<SubcatPlan>): SubcatPlan => ({
    noun,
    imageQuery: p.imageQuery ?? `${genderWord(p.gender)} ${noun}`.trim().toLowerCase(),
    nameMode: p.nameMode ?? 'apparel',
    ...p,
  });
  if (MIRROR_ONLY.has(path)) return null;

  switch (section) {
    case 'men': {
      const men = g('men');
      switch (category) {
        case 'topwear':
          return ['jackets', 'rain-jackets', 'blazers', 'coats'].includes(sub)
            ? plan({ family: 'outer', sizes: 'apparelMen', gender: men, sizeGuide: 'men-tops' })
            : plan({ family: 'top', sizes: 'apparelMen', gender: men, sizeGuide: 'men-tops' });
        case 'bottomwear':
          return plan({ family: 'bottom', sizes: ['jeans', 'trousers', 'chinos', 'cargos'].includes(sub) ? 'waistMen' : 'apparelMen', gender: men, sizeGuide: 'men-bottoms' });
        case 'footwear':
          return plan({ family: ['sandals', 'slippers'].includes(sub) ? 'sandals' : 'shoes', sizes: 'shoesMen', gender: men, sizeGuide: 'men-footwear', imageQuery: `men ${noun}`.toLowerCase() });
        case 'traditional-wear':
          if (sub === 'sherwanis') return plan({ family: 'occasionEthnic', sizes: 'apparelMen', gender: men, sizeGuide: 'men-tops' });
          if (sub === 'dhotis') return plan({ family: 'ethnic', sizes: 'freeSize', gender: men, imageQuery: 'dhoti' });
          return plan({ family: 'ethnic', sizes: 'apparelMen', gender: men, sizeGuide: 'men-tops' });
        case 'activewear':
          return plan({ family: 'active', sizes: 'apparelMen', gender: men, sizeGuide: 'men-tops' });
        case 'personal-care':
          return plan({ family: 'beauty', sizes: sub === 'haircare' ? 'vol180' : 'vol50', gender: men, brandGroup: 'grooming', nameMode: 'simple', imageQuery: `men ${noun} product`.toLowerCase() });
        case 'sunglasses':
          return plan({ family: 'eyewear', sizes: 'oneSize', gender: ['aviators', 'round-sunglasses'].includes(sub) ? 'unisex' : 'mixed-men', nameMode: 'simple', imageQuery: `${noun} sunglasses`.toLowerCase().replace('sunglasses sunglasses', 'sunglasses') });
        case 'watches':
          return sub === 'smart-watches'
            ? plan({ family: 'smartwatch', sizes: 'oneSize', gender: 'unisex', nameMode: 'simple', imageQuery: 'smartwatch' })
            : plan({ family: 'watch', sizes: 'oneSize', gender: 'mixed-men', nameMode: 'simple', imageQuery: `men ${noun}`.toLowerCase() });
        case 'innerwear':
          return plan({ family: 'intimate', sizes: 'apparelMen', gender: men, nameMode: 'simple', // Product-only photos (museum and flat-lay shots), never underwear worn on the body (owner request, 2026-10-07).
          imageQuery: noun.toLowerCase() === 'vest' ? 'undershirt MET' : noun.toLowerCase() === 'thermals' ? 'folded thermals underwear' : 'underpants AM' });
        case 'sleepwear':
          return plan({ family: 'sleep', sizes: 'apparelMen', gender: men, imageQuery: 'men pajamas' });
      }
      break;
    }
    case 'women': {
      const women = g('women');
      switch (category) {
        case 'indian-wear':
          if (['sarees', 'lehengas'].includes(sub)) return plan({ family: 'occasionEthnic', sizes: sub === 'sarees' ? 'freeSize' : 'apparelWomen', gender: women, imageQuery: noun.toLowerCase() });
          if (sub === 'dupattas') return plan({ family: 'ethnic', sizes: 'freeSize', gender: women, imageQuery: 'dupatta scarf' });
          return plan({ family: 'ethnic', sizes: 'apparelWomen', gender: women, sizeGuide: 'women-tops', imageQuery: `indian women ${noun}`.toLowerCase() });
        case 'western-wear':
          if (['jackets', 'coats'].includes(sub)) return plan({ family: 'outer', sizes: 'apparelWomen', gender: women, brandGroup: 'women', sizeGuide: 'women-tops' });
          if (['jeans', 'trousers'].includes(sub)) return plan({ family: 'bottom', sizes: 'waistWomen', gender: women, brandGroup: 'women', sizeGuide: 'women-bottoms' });
          if (['skirts', 'shorts', 'leggings', 'joggers'].includes(sub)) return plan({ family: 'bottom', sizes: 'apparelWomen', gender: women, brandGroup: 'women', sizeGuide: 'women-bottoms' });
          if (['jumpsuits', 'co-ord-sets'].includes(sub)) return plan({ family: 'dress', sizes: 'apparelWomen', gender: women, sizeGuide: 'women-tops' });
          return plan({ family: 'top', sizes: 'apparelWomen', gender: women, brandGroup: 'women', sizeGuide: 'women-tops' });
        case 'dresses':
          return plan({ family: 'dress', sizes: 'apparelWomen', gender: women, sizeGuide: 'women-tops', imageQuery: `women ${noun}`.toLowerCase() });
        case 'footwear':
          return ['heels', 'flats', 'sandals', 'wedges'].includes(sub)
            ? plan({ family: 'sandals', sizes: 'shoesWomen', gender: women, sizeGuide: 'women-footwear' })
            : plan({ family: 'shoes', sizes: 'shoesWomen', gender: women, sizeGuide: 'women-footwear' });
        case 'activewear':
          return plan({ family: 'active', sizes: sub === 'sports-bras' ? 'bra' : 'apparelWomen', gender: women, sizeGuide: 'women-tops' });
        case 'lingerie':
          return plan({ family: 'intimate', sizes: sub === 'bras' ? 'bra' : 'apparelWomen', gender: women, nameMode: 'simple', sizeGuide: sub === 'bras' ? 'bras' : undefined, imageQuery: noun.toLowerCase() === 'panties' ? 'underpants AM' : noun.toLowerCase() === 'shapewear' ? 'girdle garment museum' : `${noun} on hanger`.toLowerCase() });
        case 'sleepwear':
          return plan({ family: 'sleep', sizes: 'apparelWomen', gender: women, imageQuery: 'women pajamas' });
        case 'handbags':
          return plan({ family: 'bag', sizes: 'oneSize', gender: women, nameMode: 'simple', imageQuery: noun.toLowerCase() });
        case 'jewellery':
          return plan({ family: 'jewellery', sizes: 'oneSize', gender: women, nameMode: 'simple', imageQuery: noun.toLowerCase() });
        case 'watches':
          return plan({ family: 'watch', sizes: 'oneSize', gender: women, nameMode: 'simple', imageQuery: `women ${noun}`.toLowerCase() });
        case 'sunglasses':
          return plan({ family: 'eyewear', sizes: 'oneSize', gender: women, nameMode: 'simple', imageQuery: `women ${noun}`.toLowerCase() });
        case 'accessories':
          return plan({ family: 'smallAccessory', sizes: sub === 'socks' ? 'freeSize' : 'oneSize', gender: women, nameMode: 'simple', imageQuery: `women ${noun}`.toLowerCase() });
      }
      break;
    }
    case 'kids': {
      const kidGender: SubcatPlan['gender'] = category === 'boys-clothing' ? 'boys' : category === 'girls-clothing' ? 'girls' : category === 'infants' ? 'infant' : 'unisex';
      switch (category) {
        case 'boys-clothing':
        case 'girls-clothing':
          if (sub === 'innerwear') return plan({ family: 'intimate', sizes: 'kids', gender: kidGender, brandGroup: 'kids', nameMode: 'simple', imageQuery: "children's underwear museum" });
          if (sub === 'nightwear') return plan({ family: 'sleep', sizes: 'kids', gender: kidGender, brandGroup: 'kids', imageQuery: 'kids pajamas' });
          return plan({ family: 'kidsWear', sizes: 'kids', gender: kidGender, sizeGuide: 'kids-clothing', // "boy shorts" is also a lingerie term: kids' shorts search as children's clothing.
          imageQuery: (noun.toLowerCase() === 'shorts' ? `children shorts ${kidGender === 'boys' ? 'boy' : 'girl'}` : `${kidGender === 'boys' ? 'boy' : 'girl'} ${noun}`).toLowerCase() });
        case 'infants':
          return plan({ family: 'kidsWear', sizes: 'infant', gender: 'infant', imageQuery: `baby ${noun}`.toLowerCase() });
        case 'baby-care':
          return plan({ family: 'babyCare', sizes: sub === 'diapers' ? 'diapers' : 'oneSize', gender: 'infant', nameMode: 'simple', imageQuery: `baby ${noun}`.toLowerCase() });
        case 'footwear':
          return plan({ family: 'kidsShoes', sizes: 'shoesKids', gender: 'unisex', sizeGuide: 'kids-footwear', imageQuery: `kids ${noun}`.toLowerCase() });
        case 'toys':
          return plan({ family: 'toy', sizes: 'oneSize', gender: 'unisex', nameMode: 'simple', imageQuery: noun.toLowerCase() });
        case 'school-supplies':
          return plan({ family: 'school', sizes: 'oneSize', gender: 'unisex', nameMode: 'simple', imageQuery: `kids ${noun}`.toLowerCase() });
        case 'accessories':
          if (sub === 'sunglasses') return plan({ family: 'eyewear', sizes: 'oneSize', gender: 'unisex', brandGroup: 'kids', price: [299, 999], nameMode: 'simple', imageQuery: 'kids sunglasses' });
          if (sub === 'watches') return plan({ family: 'watch', sizes: 'oneSize', gender: 'unisex', brandGroup: 'kids', price: [499, 1999], nameMode: 'simple', imageQuery: 'kids watch' });
          return plan({ family: 'smallAccessory', sizes: 'oneSize', gender: 'unisex', brandGroup: 'kids', nameMode: 'simple', imageQuery: `kids ${noun}`.toLowerCase() });
      }
      break;
    }
    case 'home': {
      const none = g('none');
      const simple = { gender: none, nameMode: 'simple' as const, imageQuery: noun.toLowerCase() };
      switch (category) {
        case 'furniture':
          return plan({ family: 'furniture', sizes: 'oneSize', ...simple });
        case 'home-decor':
          return plan({ family: 'decor', sizes: 'oneSize', ...simple });
        case 'furnishings':
          if (['mattresses', 'bedsheets', 'blankets', 'quilts'].includes(sub)) return plan({ family: 'furnishing', sizes: 'bedding', ...simple, price: sub === 'mattresses' ? [4999, 24999] : undefined });
          return plan({ family: 'furnishing', sizes: 'oneSize', ...simple });
        case 'kitchen-and-dining':
          return plan({ family: 'kitchen', sizes: 'oneSize', ...simple });
        case 'storage-and-organisation':
          return plan({ family: 'homeUtility', sizes: 'oneSize', ...simple, price: [299, 2499] });
        case 'lighting':
          return plan({ family: 'lighting', sizes: 'oneSize', ...simple });
        case 'bath':
          return plan({ family: 'bath', sizes: 'oneSize', ...simple });
        case 'home-improvement':
          return plan({ family: 'homeUtility', sizes: 'oneSize', ...simple, price: [299, 3999] });
        case 'appliances':
          return plan({ family: 'appliance', sizes: 'oneSize', ...simple });
        case 'cleaning':
          return sub === 'vacuum-cleaners'
            ? plan({ family: 'appliance', sizes: 'oneSize', ...simple, price: [2999, 14999] })
            : plan({ family: 'homeUtility', sizes: 'oneSize', ...simple });
      }
      break;
    }
    case 'beauty': {
      const simple = { nameMode: 'simple' as const, imageQuery: `${noun} cosmetics`.toLowerCase() };
      switch (category) {
        case 'makeup':
          if (['makeup-brushes'].includes(sub)) return plan({ family: 'beautyTool', sizes: 'oneSize', gender: 'women', ...simple });
          return plan({ family: 'beauty', sizes: 'oneSize', gender: 'women', ...simple });
        case 'skincare':
          return plan({ family: 'beauty', sizes: 'vol50', gender: 'unisex', ...simple, imageQuery: `${noun} skincare`.toLowerCase() });
        case 'haircare':
          return plan({ family: 'beauty', sizes: 'vol180', gender: 'unisex', brandGroup: 'hair', ...simple, imageQuery: `${noun} hair product`.toLowerCase() });
        case 'fragrances':
          return plan({ family: 'fragrance', sizes: sub === 'deodorants' ? 'vol150' : 'vol50', gender: sub === 'deodorants' ? 'unisex' : 'mixed-women', ...simple, imageQuery: `${noun} bottle`.toLowerCase() });
        case 'bath-and-body':
          return plan({ family: 'beauty', sizes: 'vol200', gender: 'unisex', ...simple, imageQuery: `${noun} bath`.toLowerCase() });
        case 'personal-care':
          return plan({ family: 'beauty', sizes: 'oneSize', gender: 'unisex', ...simple, imageQuery: `${noun}`.toLowerCase() });
        case 'grooming':
          return ['razors', 'trimmers', 'grooming-kits'].includes(sub)
            ? plan({ family: 'beautyTool', sizes: 'oneSize', gender: 'men', brandGroup: 'grooming', ...simple, imageQuery: `men ${noun}`.toLowerCase() })
            : plan({ family: 'beauty', sizes: 'vol50', gender: 'men', brandGroup: 'grooming', ...simple, imageQuery: `men ${noun}`.toLowerCase() });
        case 'oral-care':
          return plan({ family: 'beauty', sizes: 'oneSize', gender: 'unisex', brandGroup: 'oral', ...simple, imageQuery: noun.toLowerCase() });
        case 'beauty-tools':
          return plan({ family: 'beautyTool', sizes: 'oneSize', gender: 'unisex', ...simple, imageQuery: noun.toLowerCase() });
      }
      break;
    }
    case 'gen-z': {
      const z = { brandGroup: 'genz' as const };
      const map: Record<string, () => SubcatPlan> = {
        'streetwear/parachute-pants': () => plan({ family: 'bottom', sizes: 'apparelMen', gender: 'unisex', ...z, imageQuery: 'parachute pants streetwear' }),
        'streetwear/varsity-jackets': () => plan({ family: 'outer', sizes: 'apparelMen', gender: 'unisex', ...z, imageQuery: 'varsity jacket' }),
        'streetwear/bomber-jackets': () => plan({ family: 'outer', sizes: 'apparelMen', gender: 'unisex', ...z, imageQuery: 'bomber jacket' }),
        'oversized/oversized-t-shirts': () => plan({ family: 'top', sizes: 'apparelMen', gender: 'unisex', ...z, imageQuery: 'oversized t-shirt streetwear' }),
        'oversized/baggy-jeans': () => plan({ family: 'bottom', sizes: 'waistMen', gender: 'unisex', ...z, imageQuery: 'baggy jeans' }),
        'y2k/crop-tops': () => plan({ family: 'top', sizes: 'apparelWomen', gender: 'women', ...z, imageQuery: 'crop top fashion' }),
        'y2k/mini-skirts': () => plan({ family: 'bottom', sizes: 'apparelWomen', gender: 'women', ...z, imageQuery: 'mini skirt' }),
        'y2k/denim-skirts': () => plan({ family: 'bottom', sizes: 'apparelWomen', gender: 'women', ...z, imageQuery: 'denim skirt' }),
        'co-ords/co-ord-sets': () => plan({ family: 'dress', sizes: 'apparelWomen', gender: 'women', ...z, imageQuery: 'matching co-ord set outfit' }),
        'graphic-apparel/graphic-t-shirts': () => plan({ family: 'top', sizes: 'apparelMen', gender: 'unisex', ...z, imageQuery: 'graphic t-shirt' }),
        'sneakers/chunky-sneakers': () => plan({ family: 'shoes', sizes: 'shoesMen', gender: 'unisex', ...z, imageQuery: 'chunky sneakers' }),
        'sneakers/platform-shoes': () => plan({ family: 'shoes', sizes: 'shoesWomen', gender: 'women', ...z, imageQuery: 'platform shoes' }),
        'accessories/bucket-hats': () => plan({ family: 'smallAccessory', sizes: 'oneSize', gender: 'unisex', ...z, nameMode: 'simple', imageQuery: 'bucket hat' }),
        'jewellery/chains': () => plan({ family: 'jewellery', sizes: 'oneSize', gender: 'unisex', ...z, nameMode: 'simple', imageQuery: 'chain necklace' }),
        'gadgets/headphones-and-speakers': () => plan({ family: 'gadget', sizes: 'oneSize', gender: 'unisex', nameMode: 'simple', noun: 'Headphones', imageQuery: 'headphones' }),
        'gadgets/watches-and-wearables': () => plan({ family: 'smartwatch', sizes: 'oneSize', gender: 'unisex', nameMode: 'simple', noun: 'Smartwatch', imageQuery: 'smartwatch' }),
        'gadgets/phone-accessories': () => plan({ family: 'gadget', sizes: 'oneSize', gender: 'unisex', nameMode: 'simple', noun: 'Phone Accessory', imageQuery: 'phone accessories' }),
        'lifestyle/desk-decor': () => plan({ family: 'lifestyle', sizes: 'oneSize', gender: 'unisex', nameMode: 'simple', noun: 'Desk Decor', imageQuery: 'aesthetic desk decor' }),
        'lifestyle/stickers-and-badges': () => plan({ family: 'lifestyle', sizes: 'oneSize', gender: 'unisex', nameMode: 'simple', noun: 'Sticker Pack', imageQuery: 'stickers' }),
      };
      const make = map[`${category}/${sub}`];
      if (make) return make();
      break;
    }
  }
  throw new Error(`No product plan or mirror rule for subcategory "${path}"`);
}

function genderWord(gender: SubcatPlan['gender']): string {
  switch (gender) {
    case 'men':
    case 'mixed-men':
      return 'men';
    case 'women':
    case 'mixed-women':
      return 'women';
    case 'boys':
      return 'boy';
    case 'girls':
      return 'girl';
    case 'infant':
      return 'baby';
    default:
      return '';
  }
}

/** Mirror rules (T-29). Every target here is a subcategory with no products of its own. */
export const MIRRORS: MirrorRule[] = [
  // Women → Topwear / Bottomwear show Western Wear products.
  { target: 'women/topwear/tops', sources: ['women/western-wear/tops', 'women/western-wear/blouses'] },
  { target: 'women/topwear/t-shirts', sources: ['women/western-wear/t-shirts'] },
  { target: 'women/topwear/shirts', sources: ['women/western-wear/shirts'] },
  { target: 'women/topwear/sweaters-and-sweatshirts', sources: ['women/western-wear/sweaters', 'women/western-wear/hoodies'] },
  { target: 'women/topwear/jackets-and-coats', sources: ['women/western-wear/jackets', 'women/western-wear/coats'] },
  ...['jeans', 'trousers', 'skirts', 'shorts', 'leggings', 'joggers'].map((s) => ({ target: `women/bottomwear/${s}`, sources: [`women/western-wear/${s}`] })),
  // Women → Beauty & Personal Care show Beauty products.
  { target: 'women/beauty-and-personal-care/makeup', sources: ['beauty/makeup/lipstick', 'beauty/makeup/foundation', 'beauty/makeup/kajal', 'beauty/makeup/eyeliner', 'beauty/makeup/mascara', 'beauty/makeup/blush'] },
  { target: 'women/beauty-and-personal-care/skincare', sources: ['beauty/skincare/serum', 'beauty/skincare/moisturiser', 'beauty/skincare/face-wash', 'beauty/skincare/sunscreen'] },
  { target: 'women/beauty-and-personal-care/haircare', sources: ['beauty/haircare/shampoo', 'beauty/haircare/conditioner', 'beauty/haircare/hair-serum', 'beauty/haircare/hair-oil'] },
  { target: 'women/beauty-and-personal-care/fragrances', sources: ['beauty/fragrances/perfumes', 'beauty/fragrances/body-mists'], genders: ['women', 'unisex'] },
  { target: 'women/beauty-and-personal-care/bath-and-body', sources: ['beauty/bath-and-body/body-lotion', 'beauty/bath-and-body/body-wash', 'beauty/bath-and-body/scrubs'] },
  // Men → Personal Care: grooming and fragrance products from Beauty.
  { target: 'men/personal-care/grooming', sources: ['beauty/grooming/grooming-kits', 'beauty/grooming/trimmers'] },
  { target: 'men/personal-care/shaving', sources: ['beauty/grooming/shaving-products', 'beauty/grooming/razors'] },
  { target: 'men/personal-care/beard-care', sources: ['beauty/grooming/beard-care'] },
  { target: 'men/personal-care/deodorants', sources: ['beauty/fragrances/deodorants'], genders: ['men', 'unisex'] },
  { target: 'men/personal-care/fragrances', sources: ['beauty/fragrances/perfumes', 'beauty/fragrances/attars'], genders: ['men', 'unisex'] },
  // Unisex sunglasses and smartwatches appear for both Men and Women.
  { target: 'women/sunglasses/aviators', sources: ['men/sunglasses/aviators'], genders: ['unisex'] },
  { target: 'women/sunglasses/round-sunglasses', sources: ['men/sunglasses/round-sunglasses'], genders: ['unisex'] },
  { target: 'women/watches/smart-watches', sources: ['men/watches/smart-watches'], genders: ['unisex'] },
  // Home → Bedding shows Furnishings bedding; Storage shows Furniture shelves and wardrobes.
  ...['bedsheets', 'blankets', 'quilts', 'pillows', 'mattresses'].map((s) => ({ target: `home/bedding/${s}`, sources: [`home/furnishings/${s}`] })),
  { target: 'home/storage-and-organisation/shelves', sources: ['home/furniture/shelves'] },
  { target: 'home/storage-and-organisation/wardrobes', sources: ['home/furniture/wardrobes'] },
  // Gen Z: trend-led picks from across fashion, plus its own items.
  { target: 'gen-z/streetwear/cargo-pants', sources: ['men/bottomwear/cargos'] },
  { target: 'gen-z/streetwear/hoodies', sources: ['men/topwear/hoodies', 'women/western-wear/hoodies'] },
  { target: 'gen-z/streetwear/sweatshirts', sources: ['men/topwear/sweatshirts'] },
  { target: 'gen-z/y2k/tank-tops', sources: ['men/topwear/tank-tops', 'women/western-wear/tops'], limit: 16 },
  { target: 'gen-z/partywear/bodycon-dresses', sources: ['women/dresses/bodycon-dresses', 'women/dresses/mini-dresses'] },
  { target: 'gen-z/partywear/party-dresses', sources: ['women/dresses/party-dresses', 'women/dresses/midi-dresses'] },
  { target: 'gen-z/sneakers/classic-sneakers', sources: ['men/footwear/sneakers', 'women/footwear/sneakers'] },
  { target: 'gen-z/bags/sling-bags', sources: ['women/handbags/sling-bags', 'women/handbags/crossbody-bags'] },
  { target: 'gen-z/bags/shoulder-bags', sources: ['women/handbags/shoulder-bags', 'women/handbags/tote-bags'] },
  { target: 'gen-z/bags/backpacks', sources: ['women/handbags/backpacks', 'kids/school-supplies/school-bags'] },
  { target: 'gen-z/accessories/caps', sources: ['women/accessories/caps-and-hats'] },
  { target: 'gen-z/accessories/sunglasses', sources: ['men/sunglasses/round-sunglasses', 'women/sunglasses/oversized-sunglasses', 'women/sunglasses/cat-eye-sunglasses'] },
  { target: 'gen-z/jewellery/bracelets', sources: ['women/jewellery/bracelets'] },
  { target: 'gen-z/jewellery/rings', sources: ['women/jewellery/rings'] },
  { target: 'gen-z/jewellery/earrings', sources: ['women/jewellery/earrings'] },
  { target: 'gen-z/beauty/lip-products', sources: ['beauty/makeup/lipstick', 'beauty/makeup/lip-gloss', 'beauty/makeup/lip-balm'] },
  { target: 'gen-z/beauty/fragrances', sources: ['beauty/fragrances/body-mists', 'beauty/fragrances/perfumes'] },
  { target: 'gen-z/skincare/skincare-essentials', sources: ['beauty/skincare/serum', 'beauty/skincare/sunscreen', 'beauty/skincare/moisturiser', 'beauty/skincare/face-wash', 'beauty/skincare/toner', 'beauty/skincare/cleanser', 'beauty/skincare/face-masks', 'beauty/skincare/exfoliators'] },
  { target: 'gen-z/lifestyle/water-bottles', sources: ['home/kitchen-and-dining/bottles', 'kids/school-supplies/water-bottles'] },
];

/** Extra sources for subcategories that also have products of their own. */
export const MIRROR_EXTRAS: MirrorRule[] = [
  { target: 'gen-z/co-ords/co-ord-sets', sources: ['women/western-wear/co-ord-sets'] },
];

/**
 * Minimum products for some source subcategories, so the subcategories that mirror them
 * reach the 48-per-category minimum (DAT-002).
 */
export const MIN_OVERRIDES: Record<string, number> = {
  ...Object.fromEntries(['jeans', 'trousers', 'skirts', 'shorts', 'leggings', 'joggers'].map((s) => [`women/western-wear/${s}`, 8])),
  ...Object.fromEntries(['bedsheets', 'blankets', 'quilts', 'pillows', 'mattresses'].map((s) => [`home/furnishings/${s}`, 10])),
  ...Object.fromEntries(['bodycon-dresses', 'mini-dresses', 'party-dresses', 'midi-dresses'].map((s) => [`women/dresses/${s}`, 12])),
  ...Object.fromEntries(['tote-bags', 'shoulder-bags', 'sling-bags', 'backpacks', 'clutches', 'wallets', 'crossbody-bags'].map((s) => [`women/handbags/${s}`, 9])),
  ...Object.fromEntries(['lipstick', 'lip-gloss', 'lip-balm'].map((s) => [`beauty/makeup/${s}`, 8])),
};

/** Targets filled by special rules after generation (best sellers, newest). */
export const DYNAMIC_MIRRORS = ['gen-z/trending-now/viral-picks', 'gen-z/trending-now/new-drops'] as const;

export const MIRROR_ONLY = new Set<string>([...MIRRORS.map((m) => m.target), ...DYNAMIC_MIRRORS]);
