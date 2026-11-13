import { cached, HOUR } from "../cache";
import { MAX_HITS } from "./limit";
import { chainKey, needsApp, unitPrice, type Offer } from "../logic";

// Undocumented API: the keys are published in the homepage's config JSON and rotate.
const headers = { "user-agent": "Mozilla/5.0" };
const timeout = () => AbortSignal.timeout(15_000);

function keys(fresh: boolean) {
  return cached("marktguru-keys", 6 * HOUR, fresh, async () => {
    const html = await (await fetch("https://www.marktguru.de/", { headers, signal: timeout() })).text();
    const apiKey = html.match(/"apiKey":"([^"]+)"/)?.[1];
    const clientKey = html.match(/"clientKey":"([^"]+)"/)?.[1];
    if (!apiKey || !clientKey) throw new Error("marktguru: keys not found on homepage");
    return { "x-apikey": apiKey, "x-clientkey": clientKey };
  });
}

type Raw = {
  id: number;
  price: number;
  oldPrice: number | null;
  referencePrice: number | null;
  description: string | null;
  volume: number | null;
  quantity: number | null;
  requiresLoyalityMembership: boolean;
  brand?: { name?: string };
  product?: { name?: string };
  unit?: { shortName?: string };
  advertisers?: { id: string; name: string }[];
  validityDates?: { from: string; to: string }[];
  categories?: { name: string }[];
};

async function page(q: string, zip: string, offset: number, retry = true): Promise<{ totalResults: number; results: Raw[] }> {
  const url = `https://api.marktguru.de/api/v1/offers/search?as=web&limit=100&offset=${offset}&zipCode=${zip}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { ...headers, ...(await keys(!retry)) }, signal: timeout() });
  if ((res.status === 401 || res.status === 403) && retry) return page(q, zip, offset, false); // keys rotated
  if (!res.ok) throw new Error(`marktguru: HTTP ${res.status}`);
  return res.json();
}

export async function search(q: string, { zip }: { zip: string }): Promise<Offer[]> {
  const raw: Raw[] = [];
  for (let offset = 0; offset < MAX_HITS; offset += 100) {
    const p = await page(q, zip, offset);
    raw.push(...p.results);
    if (p.results.length === 0 || raw.length >= p.totalResults) break;
  }
  return raw.flatMap((r) => {
    const dates = r.validityDates?.[0];
    if (!dates || typeof r.price !== "number") return [];
    const description = r.description ?? "";
    const unit = r.unit?.shortName ?? null;
    const comparable = unit === "l" || unit === "kg"; // a price per piece says nothing across products
    return (r.advertisers ?? []).map((a) => ({
      id: `marktguru:${r.id}:${a.id}`,
      source: "marktguru",
      chain: a.name,
      chainKey: chainKey(a.name),
      title: [r.brand?.name, r.product?.name].filter(Boolean).join(" "),
      description,
      price: r.price,
      oldPrice: r.oldPrice,
      unitPrice: comparable ? (r.referencePrice ?? unitPrice(r.price, r.volume, r.quantity)) : null,
      unit: comparable ? unit : null,
      validFrom: new Date(dates.from).toISOString(),
      validTo: new Date(dates.to).toISOString(),
      needsApp: needsApp(r.requiresLoyalityMembership, description),
      image: `https://mg2de.b-cdn.net/api/v1/offers/${r.id}/images/default/0/small.webp`,
      categories: (r.categories ?? []).map((c) => c.name),
    }));
  });
}
