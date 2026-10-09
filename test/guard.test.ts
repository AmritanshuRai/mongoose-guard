import { describe, expect, it } from "vitest";
import {
  createGuard,
  GuardConfigError,
  type GuardOptions,
  type GuardResult,
  type Issue,
  validateBody,
} from "../src/index.js";
import { buildModels, versions } from "./fixtures.js";

function expectIssues(result: GuardResult, expected: Partial<Issue>[]): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.issues).toEqual(expected.map((issue) => expect.objectContaining(issue)));
}

function expectData(result: GuardResult, data: Record<string, unknown>): void {
  expect(result).toEqual({ ok: true, data });
}

describe.each(versions)("$label", ({ mongoose }) => {
  const { User, Order, Flaky } = buildModels(mongoose);
  const check = (body: unknown, options: GuardOptions) => validateBody(User, body, options);

  describe("allowlist", () => {
    const options = { allow: ["name", "age"] };

    it("accepts allowed fields and returns them", async () => {
      expectData(await check({ name: "Amrit", age: 20 }, options), { name: "Amrit", age: 20 });
    });

    it("rejects fields that are not in the schema", async () => {
      expectIssues(await check({ name: "Amrit", nickname: "A" }, options), [
        { code: "unknown_field", path: "nickname" },
      ]);
    });

    it("rejects schema fields that are not allowed", async () => {
      expectIssues(await check({ name: "Amrit", role: "admin", isVerified: true }, options), [
        { code: "forbidden_field", path: "role" },
        { code: "forbidden_field", path: "isVerified" },
      ]);
    });

    it("strips unknown and forbidden fields in strip mode", async () => {
      const result = await check(
        { name: "Amrit", role: "admin", nickname: "A" },
        { ...options, unknown: "strip" },
      );
      expectData(result, { name: "Amrit" });
    });

    it("still reports type errors in strip mode", async () => {
      expectIssues(await check({ name: "Amrit", age: "20" }, { ...options, unknown: "strip" }), [
        { code: "invalid_type", path: "age", message: "Expected number, received string" },
      ]);
    });

    it("treats an empty allowlist as allowing nothing", async () => {
      expectIssues(await check({ name: "Amrit" }, { allow: [] }), [
        { code: "forbidden_field", path: "name" },
      ]);
      expectData(await check({}, { allow: [] }), {});
    });
  });

  describe("body", () => {
    it.each([
      ["null", null],
      ["an array", [{ name: "Amrit" }]],
      ["a string", "name=Amrit"],
      ["undefined", undefined],
      ["a class instance", new Date()],
    ])("rejects %s", async (_label, body) => {
      expectIssues(await check(body, { allow: ["name"] }), [{ code: "invalid_body", path: "" }]);
    });

    it("accepts objects without a prototype", async () => {
      const body = Object.assign(Object.create(null), { name: "Amrit" });
      expectData(await check(body, { allow: ["name"] }), { name: "Amrit" });
    });
  });

  describe("unsafe keys", () => {
    it("rejects __proto__ without polluting prototypes", async () => {
      const body = JSON.parse('{"name":"Amrit","__proto__":{"polluted":true}}');
      expectIssues(await check(body, { allow: ["name"] }), [
        { code: "unsafe_key", path: "__proto__" },
      ]);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it("rejects operator and dotted keys even in strip mode", async () => {
      const result = await check(
        { name: "Amrit", $set: { role: "admin" }, "address.city": "Delhi" },
        { allow: ["name", "address"], unknown: "strip" },
      );
      expectIssues(result, [
        { code: "unsafe_key", path: "$set" },
        { code: "unsafe_key", path: "address.city" },
      ]);
    });

    it("rejects constructor and prototype keys", async () => {
      expectIssues(await check({ constructor: 1, prototype: 2 }, { allow: ["name"] }), [
        { code: "unsafe_key", path: "constructor" },
        { code: "unsafe_key", path: "prototype" },
      ]);
    });
  });

  describe("nested objects", () => {
    it("allows every child when the parent is allowed", async () => {
      const body = { name: "Amrit", profile: { bio: "hi", links: { site: "a.dev" } } };
      expectData(await check(body, { allow: ["name", "profile"] }), body);
    });

    it("allows only the listed child", async () => {
      const body = { name: "Amrit", profile: { bio: "hi", links: { site: "a.dev" } } };
      expectIssues(await check(body, { allow: ["name", "profile.bio"] }), [
        { code: "forbidden_field", path: "profile.links" },
      ]);
    });

    it("allows a deep child without its siblings", async () => {
      const body = { profile: { links: { github: "amrit", site: "a.dev" } } };
      expectIssues(await check(body, { allow: ["profile.links.github"] }), [
        { code: "forbidden_field", path: "profile.links.site" },
      ]);
    });

    it("rejects unknown nested keys", async () => {
      expectIssues(await check({ profile: { hacked: true } }, { allow: ["profile"] }), [
        { code: "unknown_field", path: "profile.hacked" },
      ]);
    });

    it("requires nested values to be objects", async () => {
      expectIssues(await check({ profile: "bio" }, { allow: ["profile"] }), [
        { code: "invalid_type", path: "profile", message: "Expected object, received string" },
      ]);
      expectIssues(await check({ profile: null }, { allow: ["profile"] }), [
        { code: "invalid_type", path: "profile" },
      ]);
    });

    it("runs Mongoose rules on nested fields", async () => {
      const body = { profile: { bio: "x".repeat(21) } };
      expectIssues(await check(body, { allow: ["profile"], partial: true }), [
        { code: "invalid_value", path: "profile.bio", rule: "maxlength" },
      ]);
    });
  });

  describe("subdocuments", () => {
    it("accepts a valid subdocument", async () => {
      const body = { name: "Amrit", address: { city: "Delhi", zip: "110001" } };
      expectData(await check(body, { allow: ["name", "address"] }), body);
    });

    it("rejects unknown keys inside the subdocument", async () => {
      const body = { address: { city: "Delhi", hacked: true } };
      expectIssues(await check(body, { allow: ["address"] }), [
        { code: "unknown_field", path: "address.hacked" },
      ]);
    });

    it("limits access to the listed subdocument fields", async () => {
      const body = { address: { city: "Delhi", zip: "110001" } };
      expectIssues(await check(body, { allow: ["address.city"] }), [
        { code: "forbidden_field", path: "address.zip" },
      ]);
    });

    it("runs required and match rules inside the subdocument", async () => {
      const body = { name: "Amrit", address: { zip: "12" } };
      expectIssues(await check(body, { allow: ["name", "address"] }), [
        { code: "invalid_value", path: "address.city", rule: "required" },
        { code: "invalid_value", path: "address.zip", rule: "regexp" },
      ]);
    });

    it("validates only the sent subdocument fields in partial mode", async () => {
      expectIssues(await check({ address: { zip: "12" } }, { allow: ["address"], partial: true }), [
        { code: "invalid_value", path: "address.zip", rule: "regexp" },
      ]);
    });

    it("checks required child fields reachable through a narrow allow entry", async () => {
      expectIssues(
        await check({ name: "Amrit", address: {} }, { allow: ["name", "address.city"] }),
        [{ code: "invalid_value", path: "address.city", rule: "required" }],
      );
    });

    it("skips required subdocument fields that are not allowed", async () => {
      const options = { allow: ["shipping.city"] };
      expectData(await validateBody(Order, { shipping: { city: "Delhi" } }, options), {
        shipping: { city: "Delhi" },
      });
      expectIssues(await validateBody(Order, { shipping: {} }, options), [
        { code: "invalid_value", path: "shipping.city", rule: "required" },
      ]);
    });

    it("accepts null and missing subdocuments that are not required", async () => {
      expectData(await check({ name: "Amrit", address: null }, { allow: ["name", "address"] }), {
        name: "Amrit",
        address: null,
      });
      expectData(await check({ name: "Amrit" }, { allow: ["name", "address"] }), {
        name: "Amrit",
      });
    });

    it("requires subdocuments to be objects", async () => {
      expectIssues(await check({ address: "Delhi" }, { allow: ["address"] }), [
        { code: "invalid_type", path: "address", message: "Expected object, received string" },
      ]);
    });
  });

  describe("document arrays", () => {
    const options = { allow: ["addresses"], partial: true };

    it("accepts valid elements", async () => {
      const body = { addresses: [{ city: "Delhi" }, { city: "Pune", zip: "411001" }] };
      expectData(await check(body, options), body);
    });

    it("reports element errors with their index", async () => {
      const body = { addresses: [{ city: "Delhi" }, { zip: "411001" }] };
      expectIssues(await check(body, options), [
        { code: "invalid_value", path: "addresses.1.city", rule: "required" },
      ]);
    });

    it("rejects unknown keys inside elements", async () => {
      const body = { addresses: [{ city: "Delhi" }, { city: "Pune", hacked: true }] };
      expectIssues(await check(body, options), [
        { code: "unknown_field", path: "addresses.1.hacked" },
      ]);
    });

    it("skips required element fields that are not allowed", async () => {
      const options = { allow: ["stops.city"] };
      expectData(await validateBody(Order, { stops: [{ city: "Delhi" }] }, options), {
        stops: [{ city: "Delhi" }],
      });
      expectIssues(await validateBody(Order, { stops: [{ city: "Delhi" }, {}] }, options), [
        { code: "invalid_value", path: "stops.1.city", rule: "required" },
      ]);
    });

    it("applies narrow allow entries to every element", async () => {
      const body = { addresses: [{ city: "Delhi", zip: "110001" }] };
      expectIssues(await check(body, { allow: ["addresses.city"] }), [
        { code: "forbidden_field", path: "addresses.0.zip" },
      ]);
    });

    it("requires an array of objects", async () => {
      expectIssues(await check({ addresses: { city: "Delhi" } }, options), [
        { code: "invalid_type", path: "addresses", message: "Expected array, received object" },
      ]);
      expectIssues(await check({ addresses: ["Delhi"] }, options), [
        { code: "invalid_type", path: "addresses.0", message: "Expected object, received string" },
      ]);
    });
  });

  describe("primitive arrays", () => {
    const options = { allow: ["tags", "matrix"], partial: true };

    it("accepts arrays of the right type", async () => {
      const body = { tags: ["a", "b"], matrix: [[1, 2], [3]] };
      expectData(await check(body, options), body);
    });

    it("checks every element type", async () => {
      expectIssues(await check({ tags: ["a", 1], matrix: [[1, "2"]] }, options), [
        { code: "invalid_type", path: "tags.1", message: "Expected string, received number" },
        { code: "invalid_type", path: "matrix.0.1", message: "Expected number, received string" },
      ]);
    });

    it("runs array-level validators", async () => {
      expectIssues(await check({ tags: ["a", "b", "c", "d"] }, options), [
        { code: "invalid_value", path: "tags", message: "Too many tags" },
      ]);
    });

    it("requires an array", async () => {
      expectIssues(await check({ tags: "a" }, options), [
        { code: "invalid_type", path: "tags", message: "Expected array, received string" },
      ]);
    });
  });

  describe("maps", () => {
    const options = { allow: ["scores", "contacts"], partial: true };

    it("accepts valid maps", async () => {
      const body = { scores: { math: 90 }, contacts: { home: { city: "Delhi" } } };
      expectData(await check(body, options), body);
    });

    it("checks value types and rules", async () => {
      expectIssues(await check({ scores: { math: "90", art: 1 } }, options), [
        { code: "invalid_type", path: "scores.math" },
      ]);
      expectIssues(await check({ scores: { math: -1 } }, options), [
        { code: "invalid_value", path: "scores.math", rule: "min" },
      ]);
    });

    it("walks subdocument values", async () => {
      expectIssues(await check({ contacts: { home: { city: "Delhi", hacked: 1 } } }, options), [
        { code: "unknown_field", path: "contacts.home.hacked" },
      ]);
      expectIssues(await check({ contacts: { home: {} } }, options), [
        { code: "invalid_value", path: "contacts.home.city", rule: "required" },
      ]);
    });

    it("rejects unsafe map keys", async () => {
      expectIssues(await check({ scores: { $where: 1, "a.b": 2 } }, options), [
        { code: "unsafe_key", path: "scores.$where" },
        { code: "unsafe_key", path: "scores.a.b" },
      ]);
    });

    it("requires an object", async () => {
      expectIssues(await check({ scores: [1] }, options), [
        { code: "invalid_type", path: "scores", message: "Expected object, received array" },
      ]);
    });
  });

  describe("mixed fields", () => {
    const options = { allow: ["settings"], partial: true };

    it("accepts arbitrary JSON", async () => {
      const body = { settings: { theme: "dark", panels: [{ open: true }], count: 3 } };
      expectData(await check(body, options), body);
    });

    it("rejects operator keys at any depth", async () => {
      const body = { settings: { filters: [{ price: { $gt: 0 } }] } };
      expectIssues(await check(body, options), [
        { code: "unsafe_key", path: "settings.filters.0.price.$gt" },
      ]);
    });

    it("rejects values nested too deeply", async () => {
      let settings: Record<string, unknown> = {};
      for (let depth = 0; depth < 40; depth++) settings = { next: settings };
      const result = await check({ settings }, options);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issues[0]?.code).toBe("invalid_body");
    });
  });

  describe("scalar types", () => {
    const objectId = "65a1f0c2b4d3e2a1f0c2b4d3";
    const uuid = "123e4567-e89b-42d3-a456-426614174000";

    it.each([
      ["name", "Amrit", 42, "string"],
      ["age", 20, Number.NaN, "number"],
      ["age", 20.5, "20", "number"],
      ["isVerified", false, "false", "boolean"],
      ["birthday", "2000-01-31", "yesterday", "ISO 8601 date"],
      ["birthday", "2000-01-31T10:20:30.000Z", 949_312_830_000, "ISO 8601 date"],
      ["managerId", objectId, "123", "ObjectId"],
      ["balance", "10.50", "ten", "decimal"],
      ["balance", 10.5, true, "decimal"],
      ["externalId", uuid, "not-a-uuid", "UUID"],
      ["views", "9007199254740993", "1.5", "integer"],
      ["views", 42, 4.2, "integer"],
      ["avatar", "aGVsbG8=", 12, "string or binary data"],
      ["rating", 4.5, "4.5", "number"],
      ["level", 7, 2 ** 31, "32-bit integer"],
    ])("%s accepts %j and rejects %j", async (field, good, bad, expected) => {
      const options = { allow: [field], partial: true };
      expect((await check({ [field]: good }, options)).ok).toBe(true);
      expectIssues(await check({ [field]: bad }, options), [
        {
          code: "invalid_type",
          path: field,
          message: expect.stringContaining(`Expected ${expected}`),
        },
      ]);
    });

    it("accepts Date and ObjectId instances", async () => {
      const options = { allow: ["birthday", "managerId"], partial: true };
      const body = { birthday: new Date("2000-01-31"), managerId: new mongoose.Types.ObjectId() };
      expectData(await check(body, options), body);
      expectIssues(await check({ birthday: new Date("nope") }, options), [
        { code: "invalid_type", path: "birthday" },
      ]);
    });

    it("accepts null for optional fields", async () => {
      expectData(await check({ age: null }, { allow: ["age"], partial: true }), { age: null });
    });

    it("treats null as missing for required fields", async () => {
      expectIssues(await check({ name: null }, { allow: ["name"] }), [
        { code: "invalid_value", path: "name", rule: "required" },
      ]);
    });
  });

  describe("Mongoose rules", () => {
    it("reports every failing rule", async () => {
      const body = { name: "A", age: 5, role: "root" };
      expectIssues(await check(body, { allow: ["name", "age", "role"] }), [
        { code: "invalid_value", path: "name", rule: "minlength" },
        { code: "invalid_value", path: "age", rule: "min" },
        { code: "invalid_value", path: "role", rule: "enum" },
      ]);
    });

    it("runs async validators", async () => {
      expectIssues(await check({ username: "taken" }, { allow: ["username"], partial: true }), [
        { code: "invalid_value", path: "username", message: "Username is taken" },
      ]);
    });

    it("checks required allowed fields that were not sent", async () => {
      expectIssues(await check({ age: 20 }, { allow: ["name", "age"] }), [
        { code: "invalid_value", path: "name", rule: "required" },
      ]);
    });

    it("skips required fields that are not allowed", async () => {
      expect((await check({ name: "Amrit" }, { allow: ["name"] })).ok).toBe(true);
    });

    it("validates only sent fields in partial mode", async () => {
      expect((await check({ age: 20 }, { allow: ["name", "age"], partial: true })).ok).toBe(true);
      expectIssues(await check({ age: 5 }, { allow: ["name", "age"], partial: true }), [
        { code: "invalid_value", path: "age", rule: "min" },
      ]);
    });

    it("leaves rule out of structural issues", async () => {
      const result = await check({ nickname: "A" }, { allow: ["name"] });
      expect(result.ok || result.issues[0]).not.toHaveProperty("rule");
    });

    it("propagates errors that are not validation failures", async () => {
      await expect(validateBody(Flaky, { name: "x" }, { allow: ["name"] })).rejects.toThrow(
        "database unavailable",
      );
    });
  });

  describe("returned data", () => {
    it("is the accepted input, untouched by setters or defaults", async () => {
      const body = { name: "Amrit", email: "A@B.COM" };
      expectData(await check(body, { allow: ["name", "email"] }), body);
    });

    it("does not mutate the input", async () => {
      const body = {
        name: "Amrit",
        role: "admin",
        addresses: [{ city: "Delhi" }],
        tags: ["a"],
      };
      const snapshot = structuredClone(body);
      await check(body, { allow: ["name", "addresses", "tags"], unknown: "strip" });
      expect(body).toEqual(snapshot);
    });
  });

  describe("configuration", () => {
    it.each([
      [
        "a path missing from the schema",
        ["adress"],
        'does not match the schema ("adress" not found)',
      ],
      ["a missing nested child", ["profile.age"], '"profile.age" not found'],
      ["a path inside a primitive array", ["tags.length"], 'reaches inside "tags"'],
      ["a path inside a map", ["scores.math"], 'reaches inside "scores"'],
      ["a path inside a mixed field", ["settings.theme"], 'reaches inside "settings"'],
      ["an empty entry", [""], "invalid allow entry"],
      ["an entry with an empty segment", ["address..city"], "invalid allow entry"],
    ])("rejects %s", (_label, allow, message) => {
      expect(() => createGuard(User, { allow })).toThrow(GuardConfigError);
      expect(() => createGuard(User, { allow })).toThrow(message);
    });

    it("rejects the validateBody promise instead of throwing", async () => {
      const pending = validateBody(User, {}, { allow: ["adress"] });
      await expect(pending).rejects.toThrow(GuardConfigError);
    });

    it("rejects an allow value that is not an array", () => {
      expect(() => createGuard(User, { allow: "name" as unknown as string[] })).toThrow(
        GuardConfigError,
      );
    });

    it("rejects an unknown field policy", () => {
      expect(() =>
        createGuard(User, { allow: ["name"], unknown: "drop" as unknown as "strip" }),
      ).toThrow('`unknown` must be "reject" or "strip"');
    });

    it("rejects something that is not a model", () => {
      const notAModel = { schema: {} } as unknown as typeof User;
      expect(() => createGuard(notAModel, { allow: [] })).toThrow(TypeError);
    });

    it("compiles once and validates many times", async () => {
      const guard = createGuard(User, { allow: ["name"] });
      expect((await guard.validate({ name: "Amrit" })).ok).toBe(true);
      expect((await guard.validate({ name: "A" })).ok).toBe(false);
    });
  });
});
