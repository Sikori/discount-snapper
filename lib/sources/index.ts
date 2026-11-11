import { cached, HOUR } from "../cache";
import { mergeOffers, type Offer } from "../logic";
import { search as kaufda } from "./kaufda";
import { search as marktguru } from "./marktguru";

export type Place = { zip: string; lat: number; lon: number };

// The one place offer data comes from: add a source by adding an adapter here.
// Order matters: on duplicates the earlier source's offer is kept.
const sources: { name: string; search: (q: string, at: Place) => Promise<Offer[]> }[] = [
  { name: "marktguru", search: marktguru },
  { name: "kaufDA", search: kaufda },
];

export async function searchAll(q: string, at: Place, fresh: boolean) {
  const where = `${at.zip}|${at.lat.toFixed(2)}|${at.lon.toFixed(2)}`;
  const settled = await Promise.allSettled(
    sources.map((s) => cached(`${s.name}|${q}|${where}`, 6 * HOUR, fresh, () => s.search(q, at))),
  );
  const failed: string[] = [];
  const offers: Offer[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") offers.push(...r.value);
    else {
      console.error(r.reason);
      failed.push(sources[i].name);
    }
  });
  return { offers: mergeOffers(offers), failed };
}
