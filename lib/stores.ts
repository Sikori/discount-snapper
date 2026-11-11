import { cached, HOUR } from "./cache";
import { chainKey, type Branch } from "./logic";

// Public servers are often at capacity; tried in order, first answer wins.
const ENDPOINTS = [
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];
const SHOPS = "supermarket|convenience|beverages|chemist|department_store|variety_store|wholesale";

// All shops within 50 km, fetched once a day per ~1 km grid cell; the radius is applied by the caller.
export function branchesNear(lat: number, lon: number): Promise<Branch[]> {
  const la = lat.toFixed(2);
  const lo = lon.toFixed(2);
  return cached(`branches|${la}|${lo}`, 24 * HOUR, false, async () => {
    const query = `[out:csv(::lat,::lon,brand,name;false;"\t")][timeout:25];nwr[shop~"^(${SHOPS})$"](around:51000,${la},${lo});out center;`;
    let error: unknown;
    for (const url of ENDPOINTS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "user-agent": "offer-finder/0.1", "content-type": "application/x-www-form-urlencoded" },
          body: "data=" + encodeURIComponent(query),
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) throw new Error(`overpass: HTTP ${res.status}`);
        return (await res.text()).split("\n").flatMap((line) => {
          const [la, lo, brand, name] = line.split("\t");
          const label = brand || name;
          return label && Number(la) ? [{ chainKey: chainKey(label), name: name || brand, lat: Number(la), lon: Number(lo) }] : [];
        });
      } catch (e) {
        error = e;
      }
    }
    throw error;
  });
}
