import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { compileAllowList } from "../src/allow.js";
import { asSchema } from "../src/schema.js";

const { Schema } = mongoose;

const schema = asSchema(
  new Schema({
    name: String,
    profile: { links: { site: String, github: String } },
    address: new Schema({ city: String, zip: String }),
  }),
);

describe("compileAllowList", () => {
  const allow = compileAllowList(schema, ["name", "profile.links.github", "address"]);

  it("covers an entry and everything below it", () => {
    expect(allow.covers("name")).toBe(true);
    expect(allow.covers("address")).toBe(true);
    expect(allow.covers("address.city")).toBe(true);
    expect(allow.covers("profile.links.github")).toBe(true);
  });

  it("does not cover ancestors or siblings of an entry", () => {
    expect(allow.covers("profile")).toBe(false);
    expect(allow.covers("profile.links")).toBe(false);
    expect(allow.covers("profile.links.site")).toBe(false);
    expect(allow.covers("nam")).toBe(false);
  });

  it("knows which containers lead to an entry", () => {
    expect(allow.leadsTo("profile")).toBe(true);
    expect(allow.leadsTo("profile.links")).toBe(true);
    expect(allow.leadsTo("profile.links.github")).toBe(false);
    expect(allow.leadsTo("address")).toBe(false);
  });
});
