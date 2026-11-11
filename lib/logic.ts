export type Offer = {
  id: string;
  source: string;
  chain: string;
  chainKey: string;
  title: string;
  description: string;
  price: number;
  oldPrice: number | null;
  unitPrice: number | null;
  unit: string | null;
  validFrom: string | null; // ISO; null when the source gives no dates
  validTo: string | null;
  categories: string[];
  needsApp: boolean;
  image: string | null;
};

export type Branch = { chainKey: string; name: string; lat: number; lon: number };

// Retailer names differ between offer sources and OpenStreetMap; first match wins.
const CHAINS: [string, RegExp][] = [
  ["edeka-foodservice", /edeka (foodservice|c\+c)/],
  ["edeka", /edeka|^e[ -]?(center|xpress)/],
  ["lidl", /lidl/],
  ["aldi", /aldi/],
  ["rewe-to-go", /rewe to go/],
  ["rewe", /^rewe/],
  ["penny", /penny/],
  ["netto-md", /netto (marken|md|city)/],
  ["kaufland", /kaufland/],
  ["norma", /^norma/],
  ["globus", /^globus(?! baumarkt)/],
  ["famila", /famila/],
  ["combi", /^combi/],
  ["tegut", /tegut/],
  ["hit", /^hit\b/],
  ["marktkauf", /marktkauf/],
  ["dm", /^dm\b/],
  ["rossmann", /rossmann/],
  ["mueller", /^müller/],
  ["budni", /budni/],
  ["trinkgut", /trinkgut/],
  ["hoffmann", /getränke hoffmann/],
  ["toom-getraenke", /toom getränke/],
  ["metro", /^metro/],
  ["nahkauf", /nahkauf/],
  ["denns", /denn'?s/],
  ["alnatura", /alnatura/],
  ["action", /^action/],
  ["tedi", /^tedi/],
  ["woolworth", /woolworth/],
  ["v-markt", /^v-markt/],
];

export function chainKey(name: string): string {
  const n = name.toLowerCase().trim();
  return CHAINS.find(([, re]) => re.test(n))?.[0] ?? n.replace(/[^a-z0-9äöüß]/g, "");
}

export function matchesTerm(term: string, text: string): boolean {
  const t = text.toLowerCase();
  return term.toLowerCase().split(/\s+/).filter(Boolean).every((w) => t.includes(w));
}

export function unitPrice(price: number, volume: number | null, quantity: number | null): number | null {
  const total = (volume ?? 0) * (quantity ?? 1);
  return total > 0 ? Math.round((price / total) * 100) / 100 : null;
}

export function needsApp(flag: boolean, text: string): boolean {
  return flag || /\bapp\b|lidl plus|kaufland card/i.test(text);
}

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

// Only merges across sources: two same-priced offers from one source are different products.
export function mergeOffers(offers: Offer[]): Offer[] {
  const out: Offer[] = [];
  for (const o of offers) {
    const dup = out.find(
      (p) =>
        p.source !== o.source &&
        p.chainKey === o.chainKey &&
        p.price === o.price &&
        (p.validFrom ?? "") <= (o.validTo ?? "9") &&
        (o.validFrom ?? "") <= (p.validTo ?? "9"),
    );
    if (!dup) out.push({ ...o });
    else dup.oldPrice ??= o.oldPrice; // keep the previous price if only the duplicate knows it
  }
  return out;
}

// Comparable offers first (cheapest per unit), then the rest by price.
export function sortOffers<T extends Offer>(offers: T[]): T[] {
  return [...offers].sort(
    (a, b) => (a.unitPrice ?? Infinity) - (b.unitPrice ?? Infinity) || a.price - b.price,
  );
}

export const mapsUrl = (lat: number, lon: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;

// Sources only know their own spelling of a product group; map common German variants onto it.
const ALIASES: [RegExp, string][] = [[/energ(ie|y)[ -]?drinks?/g, "energy drink"]];

export function normalizeTerm(term: string): string {
  return ALIASES.reduce((t, [re, to]) => t.replace(re, to), term.toLowerCase().trim().replace(/\s+/g, " "));
}

// Leaflet base prices are free text: "(1 l = € 3.96)", "10.60 / kg", "1 kg = 7.40 /8.88", "100 g = 1,49".
export function parseBasePrice(text: string): { unitPrice: number; unit: string } | null {
  const n = Number(text.match(/\d+[.,]\d+/)?.[0].replace(",", "."));
  if (!n) return null;
  const per100 = /100 ?(g|ml)\b/i.exec(text);
  if (per100) return { unitPrice: Math.round(n * 1000) / 100, unit: per100[1].toLowerCase() === "g" ? "kg" : "l" };
  if (/kg/i.test(text)) return { unitPrice: n, unit: "kg" };
  if (/\b[lI]\b|liter/i.test(text)) return { unitPrice: n, unit: "l" }; // "I-Preis" is a misread "l"
  return null;
}
