import { test } from "node:test";
import assert from "node:assert/strict";
import { authorize } from "./auth.ts";
test("operator credentials enforce role separation and deny short or absent secrets", () => {
  const previous = process.env.VERIFIER_API_TOKEN;
  try {
    delete process.env.VERIFIER_API_TOKEN;
    const request = (token: string) =>
      new Request("http://localhost", {
        headers: { Authorization: `Bearer ${token}` },
      });
    assert.throws(() => authorize(request(""), ["verifier"]));
    process.env.VERIFIER_API_TOKEN = "short";
    assert.throws(() => authorize(request("short"), ["verifier"]));
    process.env.VERIFIER_API_TOKEN = "a".repeat(64);
    assert.equal(authorize(request("a".repeat(64)), ["verifier"]), "verifier");
    assert.throws(() => authorize(request("b".repeat(64)), ["verifier"]));
    assert.throws(() => authorize(request("a".repeat(64)), ["settler"]));
  } finally {
    if (previous === undefined) delete process.env.VERIFIER_API_TOKEN;
    else process.env.VERIFIER_API_TOKEN = previous;
  }
});
