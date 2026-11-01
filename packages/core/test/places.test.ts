import { test } from "node:test";
import assert from "node:assert/strict";
import { findPlace, countries, MAP_CREDIT } from "../src/places.js";

test("places are found by their common names, accents and all, and made-up ones are not", () => {
  const fr = findPlace("France");
  assert.equal(fr?.kind, "country");
  assert.ok(fr!.lon > -5 && fr!.lon < 9 && fr!.lat > 42 && fr!.lat < 52, "france is pinned in mainland france, not french guiana");
  assert.equal(findPlace("the United States")?.iso, "USA");
  assert.equal(findPlace("UK")?.iso, "GBR");
  assert.equal(findPlace("Persia")?.iso, "IRN", "older names reach the land they name");
  assert.equal(findPlace("Burma")?.iso, "MMR");
  assert.equal(findPlace("samarkand, uzbekistan")?.name, "samarkand", "a city written with its country is the city");
  assert.equal(findPlace("merv, turkmenistan")?.iso, "TKM", "a city the gazetteer lacks falls back to the country after the comma");
  const z = findPlace("Zurich");
  assert.equal(z?.kind, "city");
  assert.ok(Math.abs(z!.lon - 8.55) < 0.1 && Math.abs(z!.lat - 47.38) < 0.1);
  assert.equal(findPlace("atlantis"), undefined);
  assert.ok(countries().length > 150);
  assert.equal(MAP_CREDIT, "Made with Natural Earth");
});
