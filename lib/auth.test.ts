import assert from "node:assert/strict";
import { test } from "node:test";
import { authorized } from "./auth.ts";

test("authorized accepts only the exact user:password", () => {
  const header = (s: string) => "Basic " + Buffer.from(s).toString("base64");
  assert.equal(authorized(header("me:geheim"), "me:geheim"), true);
  assert.equal(authorized(header("me:falsch"), "me:geheim"), false);
  assert.equal(authorized(header("me:geheim").slice(0, -2), "me:geheim"), false);
  assert.equal(authorized("", "me:geheim"), false);
  assert.equal(authorized(null, "me:geheim"), false);
});
