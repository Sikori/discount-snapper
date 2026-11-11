import { distanceKm, matchesTerm, normalizeTerm, sortOffers } from "@/lib/logic";
import { searchAll } from "@/lib/sources";
import { branchesNear } from "@/lib/stores";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const q = normalizeTerm(p.get("q") ?? "");
  const zip = p.get("zip") ?? "";
  const lat = Number(p.get("lat"));
  const lon = Number(p.get("lon"));
  const radius = Number(p.get("radius"));
  const valid =
    q.length > 0 && q.length <= 80 && /^\d{5}$/.test(zip) &&
    lat >= 47 && lat <= 56 && lon >= 5 && lon <= 16 && radius >= 1 && radius <= 50;
  if (!valid) return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });

  const [found, all] = await Promise.all([
    searchAll(q, { zip, lat, lon }, p.get("fresh") === "1"),
    branchesNear(lat, lon).catch((e) => (console.error(e), null)),
  ]);
  const failed = all ? found.failed : [...found.failed, "OpenStreetMap (Märkte)"];

  const now = new Date().toISOString();
  const live = found.offers.filter(
    (o) => (!o.validTo || o.validTo >= now) && matchesTerm(q, `${o.title} ${o.description} ${o.categories.join(" ")}`),
  );
  const chains = new Set(live.map((o) => o.chainKey));
  const branches = (all ?? [])
    .filter((b) => chains.has(b.chainKey))
    .map((b) => ({ ...b, km: distanceKm(lat, lon, b.lat, b.lon) }))
    .filter((b) => b.km <= radius)
    .sort((a, b) => a.km - b.km);

  const offers = sortOffers(live).map((o) => ({
    ...o,
    branch: branches.find((b) => b.chainKey === o.chainKey) ?? null, // nearest, list is sorted
  }));
  return Response.json({ offers, branches, failed });
}
