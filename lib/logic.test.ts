import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chainKey,
  distanceKm,
  matchesTerm,
  mergeOffers,
  needsApp,
  normalizeTerm,
  parseBasePrice,
  sortOffers,
  unitPrice,
  type Offer,
} from "./logic.ts";

const offer = (o: Partial<Offer>): Offer => ({
  id: "x",
  source: "a",
  chain: "Lidl",
  chainKey: "lidl",
  title: "Red Bull",
  description: "",
  price: 0.99,
  oldPrice: null,
  unitPrice: 3.96,
  unit: "l",
  validFrom: "2026-11-09T00:00:00.000Z",
  validTo: "2026-11-14T00:00:00.000Z",
  needsApp: false,
  image: null,
  categories: [],
  ...o,
});

test("matchesTerm needs every word", () => {
  assert.ok(matchesTerm("red bull", "Red Bull Energy Drink 250 ml"));
  assert.ok(!matchesTerm("red bull", "Red Band Fruchtgummi"));
  assert.ok(matchesTerm("  Bull  RED ", "red bull"));
});

test("unitPrice", () => {
  assert.equal(unitPrice(0.99, 0.25, 1), 3.96);
  assert.equal(unitPrice(12.49, 0.33, 20), 1.89);
  assert.equal(unitPrice(1, null, 1), null);
  assert.equal(unitPrice(1, 0, 1), null);
});

test("needsApp", () => {
  assert.ok(needsApp(true, ""));
  assert.ok(needsApp(false, "Mit der Lidl Plus Aktion"));
  assert.ok(needsApp(false, "nur mit App"));
  assert.ok(!needsApp(false, "Apfelschorle, Applaus"));
});

test("distanceKm Berlin–Hamburg is about 255 km", () => {
  const d = distanceKm(52.52, 13.405, 53.551, 9.994);
  assert.ok(d > 250 && d < 260, String(d));
  assert.equal(distanceKm(50, 10, 50, 10), 0);
});

test("chainKey maps source and map names to the same key", () => {
  assert.equal(chainKey("EDEKA Center"), chainKey("Edeka"));
  assert.equal(chainKey("ALDI SÜD"), chainKey("Aldi Süd"));
  assert.equal(chainKey("Netto Marken-Discount"), "netto-md");
  assert.notEqual(chainKey("Netto"), "netto-md");
  assert.notEqual(chainKey("EDEKA Foodservice"), chainKey("EDEKA"));
  assert.equal(chainKey("Some Shop!"), "someshop");
});

test("mergeOffers merges only across sources with same chain, price, overlapping dates", () => {
  const a = offer({ id: "1" });
  assert.equal(mergeOffers([a, offer({ id: "2", source: "b" })]).length, 1);
  assert.equal(mergeOffers([a, offer({ id: "2" })]).length, 2); // same source
  assert.equal(mergeOffers([a, offer({ id: "2", source: "b", price: 1.09 })]).length, 2);
  assert.equal(mergeOffers([a, offer({ id: "2", source: "b", chainKey: "penny" })]).length, 2);
  assert.equal(
    mergeOffers([
      a,
      offer({ id: "2", source: "b", validFrom: "2026-11-16T00:00:00.000Z", validTo: "2026-11-21T00:00:00.000Z" }),
    ]).length,
    2,
  );
});

test("sortOffers puts offers without unit price last", () => {
  const ids = sortOffers([
    offer({ id: "none", unitPrice: null, price: 0.1 }),
    offer({ id: "dear", unitPrice: 5 }),
    offer({ id: "cheap", unitPrice: 2 }),
  ]).map((o) => o.id);
  assert.deepEqual(ids, ["cheap", "dear", "none"]);
});

test("mergeOffers treats unknown dates as overlapping", () => {
  const a = offer({ id: "1" });
  assert.equal(mergeOffers([a, offer({ id: "2", source: "b", validFrom: null, validTo: null })]).length, 1);
});

test("normalizeTerm maps product group spellings", () => {
  for (const t of ["Energiedrinks", "energydrink", "Energy Drinks", "energie-drink"]) {
    assert.equal(normalizeTerm(t), "energy drink");
  }
  assert.equal(normalizeTerm("  Red   Bull "), "red bull");
});

test("parseBasePrice reads leaflet base prices", () => {
  assert.deepEqual(parseBasePrice("(1 l = € 3.96)"), { unitPrice: 3.96, unit: "l" });
  assert.deepEqual(parseBasePrice("I-Preis 3,53"), { unitPrice: 3.53, unit: "l" });
  assert.deepEqual(parseBasePrice("10.60 / kg"), { unitPrice: 10.6, unit: "kg" });
  assert.deepEqual(parseBasePrice("1 kg = 7.40 /8.88"), { unitPrice: 7.4, unit: "kg" });
  assert.deepEqual(parseBasePrice("100 g = 1,49"), { unitPrice: 14.9, unit: "kg" });
  assert.equal(parseBasePrice(""), null);
  assert.equal(parseBasePrice("je Stück 2.99"), null);
});

test("mergeOffers keeps the previous price from the dropped duplicate", () => {
  const a = offer({ id: "1" });
  const [merged] = mergeOffers([a, offer({ id: "2", source: "b", oldPrice: 1.49 })]);
  assert.equal(merged.oldPrice, 1.49);
  assert.equal(a.oldPrice, null); // input (cached) offers are not mutated
});
