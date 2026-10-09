import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { guard, invalidResponse } from "../src/adapters/web.js";
import { buildModels } from "./fixtures.js";

const { User } = buildModels(mongoose);

const jsonRequest = (body: string) =>
  new Request("http://localhost/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });

describe("web guard", () => {
  const validate = guard(User, { allow: ["name", "address"] });

  it("validates a JSON request body", async () => {
    const result = await validate(jsonRequest(JSON.stringify({ name: "Amrit" })));
    expect(result).toEqual({ ok: true, data: { name: "Amrit" } });
  });

  it("reports schema issues", async () => {
    const result = await validate(
      jsonRequest(JSON.stringify({ name: "Amrit", address: { city: "Delhi", hacked: true } })),
    );
    expect(result).toEqual({
      ok: false,
      issues: [{ code: "unknown_field", path: "address.hacked", message: "Unknown field" }],
    });
  });

  it("reports malformed JSON as an invalid body", async () => {
    const result = await validate(jsonRequest("{ name: Amrit"));
    expect(result).toEqual({
      ok: false,
      issues: [{ code: "invalid_body", path: "", message: "Request body must be valid JSON" }],
    });
  });

  it("returns a fresh issues array for every malformed request", async () => {
    const first = await validate(jsonRequest("nope"));
    const second = await validate(jsonRequest("nope"));
    expect(first.ok || second.ok).toBe(false);
    if (!first.ok && !second.ok) expect(first.issues).not.toBe(second.issues);
  });

  it("rejects an empty body", async () => {
    const result = await validate(jsonRequest(""));
    expect(result.ok).toBe(false);
  });
});

describe("invalidResponse", () => {
  const issues = [{ code: "unknown_field" as const, path: "x", message: "Unknown field" }];

  it("builds a 400 JSON response", async () => {
    const response = invalidResponse(issues);
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ errors: issues });
  });

  it("accepts a custom status and headers", async () => {
    const response = invalidResponse(issues, { status: 422, headers: { "x-trace": "abc" } });
    expect(response.status).toBe(422);
    expect(response.headers.get("x-trace")).toBe("abc");
  });
});
