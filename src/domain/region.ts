// Region presets make LifeQuest relatable worldwide: currency & prices, default
// names, shop names and everyday words change; the life lessons stay the same.
// All prices in data files are authored in a base unit (Indian rupees) and
// converted with money() at the boundary.

export type RegionId = 'in' | 'us' | 'uk' | 'eu' | 'ng' | 'jp' | 'br' | 'mx';

export interface Region {
  id: RegionId;
  label: string;
  flag: string;
  /** BCP-47 tag used to pick speech voices */
  lang: string;
  currency: { symbol: string; code: string; rate: number; step: number; decimals: number; suffix?: boolean };
  names: { mother: string; father: string; older: string; younger: string; grandparent: string; guardian: string; partnerGirl: string; partnerBoy: string };
  npc: { cashier: string; stocker: string; shopkeeper: string; receptionist: string; driver: string; librarian: string; clerk: string };
  words: {
    grandparentTitle: string; // what kids call the grandparent
    shopkeeperCall: string; // how kids refer to the corner-shop owner
    kioskName: string;
    kioskSign: string;
    endearment: string; // what parents call kids
    praise: string;
    greeting: string;
    tea: string; // the everyday drink milk is for
    dinner: string;
  };
}

export const REGIONS: Record<RegionId, Region> = {
  in: {
    id: 'in', label: 'India', flag: '🇮🇳', lang: 'en-IN',
    currency: { symbol: '₹', code: 'INR', rate: 1, step: 1, decimals: 0 },
    names: { mother: 'Meera', father: 'Raj', older: 'Arjun', younger: 'Tara', grandparent: 'Dadi', guardian: 'Aunt Leela', partnerGirl: 'Ananya', partnerBoy: 'Rohan' },
    npc: { cashier: 'Cashier Priya', stocker: 'Store helper Vikram', shopkeeper: 'Mr. Sharma', receptionist: 'Receptionist Anita', driver: 'Driver Suresh', librarian: 'Librarian Mrs. Rao', clerk: 'Postal clerk Imran' },
    words: { grandparentTitle: 'Dadi', shopkeeperCall: 'Sharma uncle', kioskName: 'Sharma General Store', kioskSign: 'SHARMA STORE', endearment: 'beta', praise: 'Shabash!', greeting: 'Namaste!', tea: 'chai', dinner: 'dal and rice' },
  },
  us: {
    id: 'us', label: 'United States', flag: '🇺🇸', lang: 'en-US',
    currency: { symbol: '$', code: 'USD', rate: 0.04, step: 0.05, decimals: 2 },
    names: { mother: 'Sarah', father: 'Mike', older: 'Jake', younger: 'Lily', grandparent: 'Grandma Rose', guardian: 'Aunt Dana', partnerGirl: 'Emma', partnerBoy: 'Tyler' },
    npc: { cashier: 'Cashier Kayla', stocker: 'Store clerk Marcus', shopkeeper: 'Mr. Lopez', receptionist: 'Receptionist Pam', driver: 'Driver Dave', librarian: 'Librarian Ms. Kim', clerk: 'Postal clerk Ray' },
    words: { grandparentTitle: 'Grandma', shopkeeperCall: 'Mr. Lopez', kioskName: "Lopez's Corner Store", kioskSign: 'CORNER STORE', endearment: 'sweetie', praise: 'Great job!', greeting: 'Hey there!', tea: 'cereal', dinner: 'pasta' },
  },
  uk: {
    id: 'uk', label: 'United Kingdom', flag: '🇬🇧', lang: 'en-GB',
    currency: { symbol: '£', code: 'GBP', rate: 0.032, step: 0.05, decimals: 2 },
    names: { mother: 'Emma', father: 'James', older: 'Oliver', younger: 'Amelia', grandparent: 'Nan', guardian: 'Aunt Claire', partnerGirl: 'Sophie', partnerBoy: 'Harry' },
    npc: { cashier: 'Cashier Chloe', stocker: 'Shop assistant Tom', shopkeeper: 'Mr. Patel', receptionist: 'Receptionist Sue', driver: 'Driver Gary', librarian: 'Librarian Mrs. Hughes', clerk: 'Post Office clerk Ben' },
    words: { grandparentTitle: 'Nan', shopkeeperCall: 'Mr. Patel', kioskName: "Patel's Corner Shop", kioskSign: 'CORNER SHOP', endearment: 'love', praise: 'Brilliant!', greeting: 'Hiya!', tea: 'tea', dinner: 'shepherd’s pie' },
  },
  eu: {
    id: 'eu', label: 'Europe (Euro)', flag: '🇪🇺', lang: 'en-IE',
    currency: { symbol: '€', code: 'EUR', rate: 0.036, step: 0.05, decimals: 2 },
    names: { mother: 'Anna', father: 'Lukas', older: 'Leon', younger: 'Mia', grandparent: 'Oma', guardian: 'Aunt Sofia', partnerGirl: 'Lina', partnerBoy: 'Felix' },
    npc: { cashier: 'Cashier Lena', stocker: 'Shop assistant Jonas', shopkeeper: 'Mr. Rossi', receptionist: 'Receptionist Eva', driver: 'Driver Klaus', librarian: 'Librarian Mrs. Novak', clerk: 'Postal clerk Pieter' },
    words: { grandparentTitle: 'Oma', shopkeeperCall: 'Mr. Rossi', kioskName: 'Rossi Mini Market', kioskSign: 'MINI MARKET', endearment: 'Schatz', praise: 'Well done!', greeting: 'Hallo!', tea: 'coffee', dinner: 'soup and bread' },
  },
  ng: {
    id: 'ng', label: 'Nigeria', flag: '🇳🇬', lang: 'en-NG',
    currency: { symbol: '₦', code: 'NGN', rate: 18, step: 50, decimals: 0 },
    names: { mother: 'Ngozi', father: 'Emeka', older: 'Chidi', younger: 'Ada', grandparent: 'Nne', guardian: 'Aunty Funke', partnerGirl: 'Amara', partnerBoy: 'Tobi' },
    npc: { cashier: 'Cashier Blessing', stocker: 'Store attendant Tunde', shopkeeper: 'Mama Nkechi', receptionist: 'Receptionist Grace', driver: 'Driver Musa', librarian: 'Librarian Mrs. Okafor', clerk: 'Postal clerk Yusuf' },
    words: { grandparentTitle: 'Nne', shopkeeperCall: 'Mama Nkechi', kioskName: "Mama Nkechi's Shop", kioskSign: 'MAMA NKECHI', endearment: 'my dear', praise: 'Well done o!', greeting: 'Good evening!', tea: 'tea', dinner: 'jollof rice' },
  },
  jp: {
    id: 'jp', label: 'Japan', flag: '🇯🇵', lang: 'en-US',
    currency: { symbol: '¥', code: 'JPY', rate: 1.8, step: 10, decimals: 0 },
    names: { mother: 'Yuki', father: 'Hiroshi', older: 'Kenta', younger: 'Hana', grandparent: 'Obaachan', guardian: 'Aunt Mai', partnerGirl: 'Yui', partnerBoy: 'Haruto' },
    npc: { cashier: 'Cashier Aoi', stocker: 'Store staff Ren', shopkeeper: 'Mr. Tanaka', receptionist: 'Receptionist Sato', driver: 'Driver Kobayashi', librarian: 'Librarian Ms. Mori', clerk: 'Postal clerk Ito' },
    words: { grandparentTitle: 'Obaachan', shopkeeperCall: 'Tanaka-san', kioskName: 'Tanaka Konbini', kioskSign: 'KONBINI', endearment: 'dear', praise: 'Sugoi! Well done!', greeting: 'Konbanwa!', tea: 'green tea', dinner: 'curry rice' },
  },
  br: {
    id: 'br', label: 'Brazil', flag: '🇧🇷', lang: 'en-US',
    currency: { symbol: 'R$', code: 'BRL', rate: 0.07, step: 0.1, decimals: 2 },
    names: { mother: 'Ana', father: 'Carlos', older: 'Pedro', younger: 'Bia', grandparent: 'Vovó', guardian: 'Tia Lúcia', partnerGirl: 'Lara', partnerBoy: 'Gabriel' },
    npc: { cashier: 'Cashier Júlia', stocker: 'Store helper Rafael', shopkeeper: 'Seu João', receptionist: 'Receptionist Paula', driver: 'Driver Marcos', librarian: 'Librarian Dona Célia', clerk: 'Postal clerk Thiago' },
    words: { grandparentTitle: 'Vovó', shopkeeperCall: 'Seu João', kioskName: 'Mercadinho do João', kioskSign: 'MERCADINHO', endearment: 'querido', praise: 'Muito bem!', greeting: 'Boa noite!', tea: 'café com leite', dinner: 'arroz e feijão' },
  },
  mx: {
    id: 'mx', label: 'Mexico', flag: '🇲🇽', lang: 'en-US',
    currency: { symbol: '$', code: 'MXN', rate: 0.22, step: 0.5, decimals: 2 },
    names: { mother: 'Lucía', father: 'Javier', older: 'Diego', younger: 'Sofi', grandparent: 'Abuela', guardian: 'Tía Carmen', partnerGirl: 'Valentina', partnerBoy: 'Mateo' },
    npc: { cashier: 'Cashier Valeria', stocker: 'Store helper Luis', shopkeeper: 'Doña Lupita', receptionist: 'Receptionist Rosa', driver: 'Driver Ramón', librarian: 'Librarian Sra. Díaz', clerk: 'Postal clerk Andrés' },
    words: { grandparentTitle: 'Abuela', shopkeeperCall: 'Doña Lupita', kioskName: 'Tienda Lupita', kioskSign: 'TIENDA LUPITA', endearment: 'mijo', praise: '¡Muy bien!', greeting: '¡Buenas tardes!', tea: 'café de olla', dinner: 'tacos' },
  },
};

let current: Region = REGIONS.in;

export function setRegion(id: RegionId) {
  current = REGIONS[id] ?? REGIONS.in;
}
export function region(): Region {
  return current;
}

/** Convert a base (INR-authored) amount to the current region's currency, rounded to a sensible step. */
export function money(base: number): number {
  const c = current.currency;
  if (c.rate === 1 && c.step === 1) return Math.round(base);
  const v = Math.max(c.step, Math.round((base * c.rate) / c.step) * c.step);
  return Math.round(v * 100) / 100;
}

export function formatMoneyIn(n: number, r: Region = current): string {
  const c = r.currency;
  const v = c.decimals ? n.toFixed(c.decimals) : String(Math.round(n));
  return c.suffix ? `${v} ${c.symbol}` : `${c.symbol}${v}`;
}

/** Replace culture tokens like {endearment}, {shopkeeper}, {grandTitle} in dialogue. */
export function words(text: string): string {
  const w = current.words;
  return text
    .replace(/\{endearment\}/g, w.endearment)
    .replace(/\{shopkeeper\}/g, w.shopkeeperCall)
    .replace(/\{kiosk\}/g, w.kioskName)
    .replace(/\{praise\}/g, w.praise)
    .replace(/\{greeting\}/g, w.greeting)
    .replace(/\{grandTitle\}/g, w.grandparentTitle)
    .replace(/\{tea\}/g, w.tea)
    .replace(/\{dinner\}/g, w.dinner);
}
