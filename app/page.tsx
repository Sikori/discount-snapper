"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Branch, Offer } from "@/lib/logic";
import { distanceKm, mapsUrl } from "@/lib/logic";

type Loc = { zip: string; name: string; lat: number; lon: number };
type Near = Branch & { km: number };
type Hit = Offer & { branch: Near | null };
type Result = { offers: Hit[]; branches: Near[]; failed: string[] };
type Plz = [zip: string, place: string, lat: number, lon: number];

const load = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};
const save = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const day = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
const km = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " km";

export default function Page() {
  const [ready, setReady] = useState(false);
  const [plz, setPlz] = useState<Plz[]>([]);
  const [loc, setLoc] = useState<Loc | null>(null);
  const [locText, setLocText] = useState("");
  const [locError, setLocError] = useState("");
  const [radius, setRadius] = useState(5);
  const [radiusQ, setRadiusQ] = useState(5); // debounced, used for requests
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [adhoc, setAdhoc] = useState("");
  const [results, setResults] = useState<Record<string, Result | "loading" | "error">>({});
  const [store, setStore] = useState("");
  const [sort, setSort] = useState("unit");
  const [maxPrice, setMaxPrice] = useState("");
  const seenAtLoad = useRef(new Set<string>());

  useEffect(() => {
    setLoc(load<Loc | null>("loc", null));
    const r = load("radius", 5);
    setRadius(r);
    setRadiusQ(r);
    setWatchlist(load<string[]>("watchlist", []));
    seenAtLoad.current = new Set(load<string[]>("seen", []));
    setReady(true);
    fetch("/plz.json").then((r) => r.json()).then(setPlz).catch(() => setLocError("Ortsdaten konnten nicht geladen werden."));
  }, []);

  useEffect(() => {
    if (!ready) return;
    save("loc", loc);
    save("radius", radiusQ);
    save("watchlist", watchlist);
  }, [ready, loc, radiusQ, watchlist]);

  useEffect(() => {
    const t = setTimeout(() => setRadiusQ(radius), 400);
    return () => clearTimeout(t);
  }, [radius]);

  const terms = useMemo(
    () => (adhoc && !watchlist.includes(adhoc) ? [adhoc, ...watchlist] : watchlist),
    [adhoc, watchlist],
  );
  const keyOf = (term: string) => (loc ? [term, loc.zip, loc.lat, loc.lon, radiusQ].join("|") : "");

  function run(term: string, fresh: boolean) {
    if (!loc) return;
    const key = keyOf(term);
    setResults((r) => ({ ...r, [key]: "loading" }));
    const params = new URLSearchParams({
      q: term, zip: loc.zip, lat: String(loc.lat), lon: String(loc.lon), radius: String(radiusQ),
    });
    if (fresh) params.set("fresh", "1");
    fetch("/api/search?" + params)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: Result) => {
        setResults((r) => ({ ...r, [key]: data }));
        if (watchlist.includes(term)) {
          const seen = [...new Set([...load<string[]>("seen", []), ...data.offers.map((o) => o.id)])];
          save("seen", seen.slice(-3000));
        }
      })
      .catch(() => setResults((r) => ({ ...r, [key]: "error" })));
  }

  useEffect(() => {
    for (const t of terms) if (results[keyOf(t)] === undefined) run(t, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terms, loc, radiusQ]);

  const suggestions = useMemo(() => {
    const s = locText.trim().toLowerCase();
    if (s.length < 2) return [];
    const out: Plz[] = [];
    for (const p of plz) {
      if (p[0].startsWith(s) || p[1].toLowerCase().startsWith(s)) out.push(p);
      if (out.length === 8) break;
    }
    return out;
  }, [locText, plz]);

  function useGps() {
    setLocError("");
    if (!navigator.geolocation) return setLocError("Dein Browser unterstützt keine Standortabfrage.");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        let best: Plz | null = null;
        let bestKm = Infinity;
        for (const p of plz) {
          const d = distanceKm(coords.latitude, coords.longitude, p[2], p[3]);
          if (d < bestKm) [best, bestKm] = [p, d];
        }
        if (!best || bestKm > 30) return setLocError("Kein deutscher Ort in der Nähe gefunden.");
        setLoc({ zip: best[0], name: `${best[1]} (Standort)`, lat: coords.latitude, lon: coords.longitude });
        setLocText("");
      },
      () => setLocError("Standort konnte nicht ermittelt werden."),
    );
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const t = draft.trim().replace(/\s+/g, " ");
    if (t) setAdhoc(t);
  }

  const stores = useMemo(() => {
    const names = new Map<string, string>();
    for (const t of terms) {
      const r = results[keyOf(t)];
      if (!r || typeof r === "string") continue;
      for (const o of r.offers) {
        const have = names.get(o.chainKey);
        if (!have || o.chain.length < have.length) names.set(o.chainKey, o.chain); // "EDEKA" over "EDEKA Bandelt"
      }
    }
    return [...names].sort((a, b) => a[1].localeCompare(b[1], "de"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terms, results, loc, radiusQ]);

  const max = Number(maxPrice.replace(",", "."));
  const visible = (offers: Hit[]) => {
    const out = offers.filter((o) => (!store || o.chainKey === store) && (!(max > 0) || o.price <= max));
    if (sort === "asc") out.sort((a, b) => a.price - b.price);
    if (sort === "desc") out.sort((a, b) => b.price - a.price);
    if (sort === "dist") out.sort((a, b) => (a.branch?.km ?? Infinity) - (b.branch?.km ?? Infinity));
    return out; // "unit" is the order the server sends
  };

  if (!ready) return null;

  return (
    <>
      <header className="top">
        <h1>Angebote</h1>
        <p className="muted">
          {loc ? `${loc.zip} ${loc.name} · ${radius} km Umkreis` : "Wähle zuerst deinen Standort."}
        </p>
      </header>

      <form className="searchbar" onSubmit={submitSearch} role="search">
        <label htmlFor="q" className="sr">Produkt suchen</label>
        <input
          id="q"
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Produkt suchen, z. B. Red Bull"
          maxLength={80}
          enterKeyHint="search"
        />
        <button type="submit" className="primary">Suchen</button>
      </form>

      <main>
        <section className="card settings" aria-label="Standort und Umkreis">
          <div className="field">
            <label htmlFor="loc">Standort</label>
            <div className="row">
              <input
                id="loc"
                value={locText}
                onChange={(e) => setLocText(e.target.value)}
                placeholder={loc ? `${loc.zip} ${loc.name}` : "PLZ oder Ort"}
                autoComplete="off"
              />
              <button type="button" onClick={useGps} disabled={!plz.length}>Mein Standort</button>
            </div>
            {suggestions.length > 0 && (
              <ul className="suggest">
                {suggestions.map((p) => (
                  <li key={p[0] + p[1]}>
                    <button
                      type="button"
                      onClick={() => {
                        setLoc({ zip: p[0], name: p[1], lat: p[2], lon: p[3] });
                        setLocText("");
                        setLocError("");
                      }}
                    >
                      <span>{p[1]}</span>
                      <span className="muted">{p[0]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {locError && <p className="notice" role="alert">{locError}</p>}
          </div>
          <div className="field">
            <label htmlFor="radius">
              Umkreis <span className="value">{radius} km</span>
            </label>
            <input id="radius" type="range" min={1} max={50} value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
          </div>
        </section>

        {loc && terms.length > 0 && (
          <div className="filters" role="group" aria-label="Filter und Sortierung">
            <div className="field">
              <label htmlFor="store">Markt</label>
              <select id="store" value={stores.some(([k]) => k === store) ? store : ""} onChange={(e) => setStore(e.target.value)}>
                <option value="">Alle Märkte</option>
                {stores.map(([k, name]) => (
                  <option key={k} value={k}>{name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="sort">Sortierung</label>
              <select id="sort" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="unit">Grundpreis</option>
                <option value="asc">Preis aufsteigend</option>
                <option value="desc">Preis absteigend</option>
                <option value="dist">Entfernung</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="max">Max. Preis (€)</label>
              <input id="max" inputMode="decimal" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="beliebig" />
            </div>
          </div>
        )}

        {loc && terms.length === 0 && (
          <p className="empty">Suche ein Produkt und füge es deiner Merkliste hinzu.</p>
        )}
        {loc && terms.map((term) => {
          const r = results[keyOf(term)];
          const watched = watchlist.includes(term);
          const data = r && typeof r !== "string" ? r : null;
          const shown = data ? visible(data.offers) : [];
          const nearby = shown.filter((o) => o.branch);
          const noBranch = shown.filter((o) => !o.branch);
          const item = (o: Hit) => (
            <li key={o.id} className="offer">
              {o.image && (
                <img src={o.image} alt="" width={64} height={64} loading="lazy" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
              )}
              <div className="text">
                <div className="title">{o.title || o.description}</div>
                <div className="muted">
                  {o.chain}
                  {o.validFrom && o.validTo && <> · {day(o.validFrom)}–{day(o.validTo)}</>}
                </div>
                {o.branch && (
                  <div className="muted">
                    <a href={mapsUrl(o.branch.lat, o.branch.lon)} target="_blank" rel="noopener">
                      {o.branch.name}
                    </a>{" "}
                    · {km(o.branch.km)}
                  </div>
                )}
                {o.title && o.description && <div className="muted desc">{o.description}</div>}
                <div className="badges">
                  {watched && !seenAtLoad.current.has(o.id) && <span className="badge new">Neu</span>}
                  {o.needsApp && <span className="badge app">App nötig</span>}
                  {o.validFrom && new Date(o.validFrom) > new Date() && <span className="badge">ab {day(o.validFrom)}</span>}
                </div>
              </div>
              <div className="price">
                <strong>{eur.format(o.price)}</strong>
                {o.oldPrice != null && o.oldPrice > o.price && (
                  <span>
                    <s>{eur.format(o.oldPrice)}</s> <b className="off">−{Math.round((1 - o.price / o.oldPrice) * 100)} %</b>
                  </span>
                )}
                {o.unitPrice != null && <span>{eur.format(o.unitPrice)}/{o.unit ?? "Einheit"}</span>}
              </div>
            </li>
          );
          return (
            <section key={term} className="results" aria-busy={r === "loading"}>
              <div className="head">
                <h2>{term}</h2>
                <div className="actions">
                  <button type="button" className="small" onClick={() => run(term, true)} disabled={r === "loading"}>
                    Aktualisieren
                  </button>
                  {watched ? (
                    <button type="button" className="small" onClick={() => setWatchlist(watchlist.filter((t) => t !== term))}>
                      Entfernen
                    </button>
                  ) : (
                    <button type="button" className="small primary" onClick={() => setWatchlist([...watchlist, term])}>
                      Merken
                    </button>
                  )}
                </div>
              </div>
              {r === "error" && <p className="notice" role="alert">Die Suche ist fehlgeschlagen. Bitte aktualisieren.</p>}
              {data?.failed.map((f) => (
                <p key={f} className="notice" role="alert">Quelle nicht erreichbar: {f}</p>
              ))}
              {(r === "loading" || r === undefined) && <p className="card empty">Suche läuft …</p>}
              {data && data.offers.length === 0 && <p className="card empty">Keine aktuellen Angebote.</p>}
              {data && data.offers.length > 0 && shown.length === 0 && (
                <p className="card empty">Keine Angebote für diesen Filter.</p>
              )}
              {nearby.length > 0 && <ul className="card">{nearby.map(item)}</ul>}
              {noBranch.length > 0 && (
                <>
                  <h3>Kein Markt im Umkreis gefunden</h3>
                  <ul className="card">{noBranch.map(item)}</ul>
                </>
              )}
            </section>
          );
        })}
      </main>
    </>
  );
}
