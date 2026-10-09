import type { AddressInfo } from "node:net";
import express, { type ErrorRequestHandler, type Express } from "express";
import mongoose from "mongoose";
import { afterEach, describe, expect, it } from "vitest";
import { guard } from "../src/adapters/express.js";
import { buildModels } from "./fixtures.js";

const { User, Flaky } = buildModels(mongoose);

interface Payload {
  validated?: unknown;
  rawBody?: unknown;
  errors?: Array<{ code: string; path: string; message: string }>;
  fields?: string[];
  error?: string;
}

const servers: Array<{ close(): void }> = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

async function post(app: Express, body: string | object, path = "/users") {
  const server = app.listen(0);
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;

  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Payload };
}

const echoValidated: express.RequestHandler = (req, res) => {
  res.json({ validated: req.validated, rawBody: req.body });
};

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  res.status(500).json({ error: (error as Error).message });
};

function appWith(...handlers: express.RequestHandler[]): Express {
  const app = express();
  app.use(express.json());
  app.post("/users", ...handlers, echoValidated);
  app.use(errorHandler);
  return app;
}

describe("express guard", () => {
  it("passes valid bodies through and exposes req.validated", async () => {
    const app = appWith(guard(User, { allow: ["name", "age"] }));
    const response = await post(app, { name: "Amrit", age: 20 });

    expect(response.status).toBe(200);
    expect(response.body.validated).toEqual({ name: "Amrit", age: 20 });
  });

  it("exposes only the accepted fields in strip mode", async () => {
    const app = appWith(guard(User, { allow: ["name"], unknown: "strip" }));
    const response = await post(app, { name: "Amrit", role: "admin" });

    expect(response.status).toBe(200);
    expect(response.body.validated).toEqual({ name: "Amrit" });
    expect(response.body.rawBody).toEqual({ name: "Amrit", role: "admin" });
  });

  it("responds 400 with the issues by default", async () => {
    const app = appWith(guard(User, { allow: ["name"] }));
    const response = await post(app, { name: "Amrit", role: "admin" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      errors: [{ code: "forbidden_field", path: "role", message: "Field is not allowed" }],
    });
  });

  it("lets callers shape the error response", async () => {
    const app = appWith(
      guard(User, {
        allow: ["name"],
        onInvalid: (issues, _req, res) => {
          res.status(422).json({ fields: issues.map((issue) => issue.path) });
        },
      }),
    );
    const response = await post(app, { nickname: "A" });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({ fields: ["nickname"] });
  });

  it("forwards unexpected errors to the error handler", async () => {
    const app = appWith(guard(Flaky, { allow: ["name"] }));
    const response = await post(app, { name: "x" });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "database unavailable" });
  });

  it("rejects requests that were not parsed as JSON objects", async () => {
    const app = express();
    app.post("/users", guard(User, { allow: ["name"] }), echoValidated);
    const response = await post(app, { name: "Amrit" });

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual([
      { code: "invalid_body", path: "", message: "Expected a JSON object" },
    ]);
  });

  it("rejects JSON arrays", async () => {
    const app = appWith(guard(User, { allow: ["name"] }));
    const response = await post(app, [{ name: "Amrit" }]);

    expect(response.status).toBe(400);
    expect(response.body.errors?.[0]?.code).toBe("invalid_body");
  });

  it("throws configuration errors when the route is defined", () => {
    expect(() => guard(User, { allow: ["nmae"] })).toThrow('"nmae" not found');
  });
});
