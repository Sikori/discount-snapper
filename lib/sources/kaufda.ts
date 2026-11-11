import { chainKey, needsApp, parseBasePrice, type Offer } from "../logic";

// Undocumented API behind kaufda.de's own search page; no key needed.
type Raw = {
  id: string;
  publisherName?: string;
  title?: string;
  brand?: string;
  parentContent?: { id?: string };
  offerImages?: { url?: { thumbnail?: string } };
  prices?: { mainPrice?: number; secondaryPrice?: number; priceByBaseUnit?: string; description?: string; conditions?: unknown };
};
type Brochure = { content: { id: string; validFrom?: string; validUntil?: string } };

async function page(q: string, lat: number, lon: number, offset: number) {
  const url = `https://www.kaufda.de/api/search?query=${encodeURIComponent(q)}&lat=${lat}&lng=${lon}&offset=${offset}&limit=100`;
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`kaufda: HTTP ${res.status}`);
  const contents = (await res.json())?.searchResults?.contents;
  return { offers: (contents?.offers ?? []) as Raw[], brochures: (contents?.brochures ?? []) as Brochure[] };
}

export async function search(q: string, { lat, lon }: { lat: number; lon: number }): Promise<Offer[]> {
  const raw: Raw[] = [];
  const brochures = new Map<string, Brochure["content"]>();
  // shortcut: stops at 300 hits like marktguru; raise if broad groups get cut off.
  for (let offset = 0; offset < 300; offset += 100) {
    const p = await page(q, lat, lon, offset);
    raw.push(...p.offers);
    for (const b of p.brochures) brochures.set(b.content.id, b.content);
    if (p.offers.length < 100) break;
  }
  const out = new Map<string, Offer>(); // the same offer is listed once per leaflet page
  for (const r of raw) {
    const price = Math.round((r.prices?.mainPrice ?? 0) * 100) / 100;
    if (!r.publisherName || !price) continue; // banners like "-20%" carry no price
    const old = Math.round((r.prices?.secondaryPrice ?? 0) * 100) / 100;
    const base = parseBasePrice(r.prices?.priceByBaseUnit ?? "");
    const dates = brochures.get(r.parentContent?.id ?? "");
    const title = [r.brand, r.title].filter(Boolean).join(" ");
    const conditions = `${r.prices?.description ?? ""} ${JSON.stringify(r.prices?.conditions ?? "")}`;
    const key = chainKey(r.publisherName);
    out.set(`${key}|${title}|${price}`, {
      id: `kaufda:${r.id}`,
      source: "kaufda",
      chain: r.publisherName,
      chainKey: key,
      title,
      description: r.prices?.description ?? "",
      price,
      oldPrice: old > price ? old : null,
      unitPrice: base?.unitPrice ?? null,
      unit: base?.unit ?? null,
      validFrom: dates?.validFrom ? new Date(dates.validFrom).toISOString() : null,
      validTo: dates?.validUntil ? new Date(dates.validUntil).toISOString() : null,
      needsApp: needsApp(false, `${title} ${conditions}`),
      image: r.offerImages?.url?.thumbnail ?? null,
      categories: [], // kaufDA files unrelated products under brand categories, so match on the title only
    });
  }
  return [...out.values()];
}
