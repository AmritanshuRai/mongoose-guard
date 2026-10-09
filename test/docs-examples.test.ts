import { describe, expect, it } from "vitest";
import { createGuard, type GuardOptions, validateBody } from "../src/index.js";
import expected from "./docs-examples.json" with { type: "json" };
import { buildDocsModels } from "./docs-model.js";

const { User } = buildDocsModels();
const signup = { allow: ["name", "email", "password"] };
const valid = { name: "Amrit", email: "amrit@example.com", password: "correct-horse" };

const scenarios: Array<[keyof typeof expected, unknown, GuardOptions]> = [
  ["signup-ok", valid, signup],
  ["mass-assignment", { ...valid, role: "admin", credits: 99999 }, signup],
  ["typo", { nmae: "Amrit", email: "amrit@example.com", password: "correct-horse" }, signup],
  ["wrong-type", { ...valid, age: "25" }, { allow: ["name", "email", "password", "age"] }],
  ["rules", { name: "A", password: "123" }, signup],
  [
    "proto",
    JSON.parse('{"name":"Amrit","__proto__":{"isAdmin":true}}'),
    { allow: ["name"], partial: true },
  ],
  ["operator-typed", { email: { $ne: null } }, { allow: ["email"], partial: true }],
  [
    "operator-mixed",
    { preferences: { filter: { $where: "sleep(1000)" } } },
    { allow: ["preferences"], partial: true },
  ],
  [
    "nested-unknown",
    { address: { city: "Delhi", hacked: true } },
    { allow: ["address"], partial: true },
  ],
  [
    "nested-narrow",
    { address: { city: "Delhi", zip: "110001" } },
    { allow: ["address.city"], partial: true },
  ],
  ["nested-rules", { address: { zip: "12" } }, { allow: ["address"], partial: true }],
  ["array-type", { tags: ["js", 42] }, { allow: ["tags"], partial: true }],
  ["patch-ok", { age: 20 }, { allow: ["name", "age"], partial: true }],
  ["patch-bad", { age: 5 }, { allow: ["name", "age"], partial: true }],
  ["full-missing-required", { age: 20 }, { allow: ["name", "age"] }],
  [
    "strip",
    { name: "Amrit", role: "admin", nickname: "A" },
    { allow: ["name"], partial: true, unknown: "strip" },
  ],
  ["strip-type", { name: 42, role: "admin" }, { allow: ["name"], partial: true, unknown: "strip" }],
  ["body-array", [valid], signup],
  ["body-null", null, signup],
  ["data-raw", { ...valid, email: "AMRIT@EXAMPLE.COM" }, signup],
  ["null-optional", { age: null }, { allow: ["age"], partial: true }],
  ["nested-null", { profile: null }, { allow: ["profile"], partial: true }],
];

describe("documented examples", () => {
  it.each(scenarios)("%s", async (name, body, options) => {
    expect(await validateBody(User, body, options)).toEqual(expected[name]);
  });

  it.each([["adress"], ["tags.0"], ["preferences.theme"], ["profile.age"], [""]])(
    "config error for %j",
    (entry) => {
      const key = `config:${entry}` as keyof typeof expected;
      expect(() => createGuard(User, { allow: [entry] })).toThrow(
        (expected[key] as string).replace("GuardConfigError: ", ""),
      );
    },
  );
});
