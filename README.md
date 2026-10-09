# mongoose-guard

Validate request bodies with the Mongoose schema you already have. You list which fields a route accepts, and mongoose-guard rejects everything else, checks types without casting, then runs your schema's own rules (`required`, `min`, `enum`, `match`, custom validators). You don't write a second schema.

Full documentation: **https://amritanshurai.github.io/mongoose-guard/**

```ts
import { guard } from "mongoose-guard/express";

router.post("/signup", guard(User, { allow: ["name", "email", "password"] }), signup);
```

## Why

Mongoose already knows what a valid user looks like. It doesn't know what a client is allowed to send. A User model usually has fields like `role`, `credits` or `isVerified`, and every one of them is valid on the model. So if you check a signup body against the schema alone, this passes:

```json
{ "name": "Amrit", "email": "a@b.com", "role": "admin", "credits": 99999 }
```

The usual fix is a second schema in Zod or Joi for every route. That works, but now the rules live in two places and drift. mongoose-guard keeps the rules in Mongoose and adds the missing piece: a per-route allowlist.

It also covers two things Mongoose does quietly on its own. Mongoose casts `"25"` to `25` and drops unknown keys without telling anyone. mongoose-guard reports both as errors.

## Install

```bash
npm install mongoose-guard
```

Needs Node 20+ and Mongoose 8 or 9. The Express adapter works with Express 4 and 5.

## Express

```ts
import express from "express";
import { guard } from "mongoose-guard/express";
import { User } from "./models/user";

const app = express();
app.use(express.json());

app.post("/signup", guard(User, { allow: ["name", "email", "password"] }), async (req, res) => {
  const user = await User.create(req.validated);
  res.status(201).json(user);
});

app.patch("/me", guard(User, { allow: ["name", "profile.bio"], partial: true }), updateMe);
```

A bad request never reaches your handler. It gets a 400:

```json
{
  "errors": [
    { "code": "forbidden_field", "path": "role", "message": "Field is not allowed" },
    { "code": "invalid_value", "path": "email", "message": "Path `email` is required.", "rule": "required" }
  ]
}
```

Use `req.validated` in the handler, not `req.body`. In strip mode they differ.

To change the error response, pass `onInvalid`:

```ts
guard(User, {
  allow: ["name"],
  onInvalid: (issues, req, res) => res.status(422).json({ fields: issues }),
});
```

Errors that aren't validation failures (a `pre("validate")` hook throwing, say) go to `next(error)` like any other Express error.

## Next.js, Hono, Remix, SvelteKit

Anything that hands you a standard `Request` uses the web adapter:

```ts
import { guard, invalidResponse } from "mongoose-guard/web";

const validateSignup = guard(User, { allow: ["name", "email", "password"] });

export async function POST(request: Request) {
  const result = await validateSignup(request);
  if (!result.ok) return invalidResponse(result.issues);

  const user = await User.create(result.data);
  return Response.json(user, { status: 201 });
}
```

Create the guard once at module level. Malformed JSON comes back as an `invalid_body` issue, not a thrown error.

This won't run on Cloudflare Workers or Vercel Edge functions, because Mongoose needs a Node runtime with TCP sockets.

## Anywhere else

The core has no framework in it:

```ts
import { createGuard } from "mongoose-guard";

const signup = createGuard(User, { allow: ["name", "email", "password"] });

const result = await signup.validate(body);
if (result.ok) {
  await User.create(result.data);
} else {
  console.log(result.issues);
}
```

`validateBody(User, body, options)` does the same in one call, but it recompiles the allowlist every time. Prefer `createGuard` for anything that runs per request.

## The allowlist

Entries are dot paths into the schema.

| Entry | Accepts |
|---|---|
| `"name"` | the `name` field |
| `"address"` | `address` and everything inside it |
| `"address.city"` | only `city` inside `address`; `address.zip` is rejected |
| `"addresses.city"` | `city` in every element of the `addresses` array |

This works the same for plain nested objects, sub-schemas, and arrays of sub-schemas. Array indexes never appear in allow entries.

Entries are checked against the schema when the guard is created. A typo like `"adress"` throws a `GuardConfigError` at startup, not on the first request. You also can't point inside a field that has no fixed keys: `"tags.0"`, `"scores.math"` on a Map, or anything under a `Mixed` field all throw. Allow the whole field instead.

## What gets checked

Every request goes through these steps in order. Structural problems stop the request before Mongoose runs, because there's no point running a `min` check on a string.

1. **The body is a plain object.** Arrays, strings, `null` and missing bodies fail with `invalid_body`.
2. **No unsafe keys.** `__proto__`, `constructor`, `prototype`, keys starting with `$` and keys containing `.` are rejected anywhere in the body, including inside Mixed fields and Map keys. This blocks prototype pollution and MongoDB operator injection like `{ "price": { "$gt": 0 } }`.
3. **Every key exists in the schema** (`unknown_field`) **and is allowed on this route** (`forbidden_field`).
4. **Types match exactly.** No casting. See the table below.
5. **Your Mongoose rules pass.** Built-in validators, custom validators and async validators all run, through Mongoose itself.

### Types

| Schema type | Accepts |
|---|---|
| `String` | string |
| `Number`, `Double` | finite number |
| `Int32` | integer within 32-bit range |
| `BigInt` | bigint, safe integer, or integer string |
| `Boolean` | `true` / `false` |
| `Date` | ISO 8601 string, or a valid `Date` |
| `ObjectId` | 24-character hex string, or an ObjectId |
| `Decimal128` | number or numeric string |
| `UUID` | UUID string |
| `Buffer` | string or `Uint8Array` |
| `Mixed` | anything (still scanned for unsafe keys) |
| arrays, Maps, sub-schemas | each element, value and field is checked with these same rules |

`null` is accepted for any field except plain nested objects (a nested `profile: { bio: String }` must be an object). If the field is `required`, Mongoose's `required` rule reports it.

Custom SchemaTypes from plugins skip step 4 and go straight to Mongoose.

## Options

```ts
interface GuardOptions {
  allow: readonly string[];
  partial?: boolean;            // default false
  unknown?: "reject" | "strip"; // default "reject"
}
```

### `partial`

Off by default, so required fields are enforced: an allowed field marked `required` must be in the body.

Turn it on for PATCH routes. Only the fields that were actually sent get validated, and missing required fields are fine.

```ts
guard(User, { allow: ["name", "age"], partial: true });
// { age: 20 } passes even though `name` is required
```

### `unknown`

`"reject"` (the default) fails the request when it has unknown or forbidden fields. Clients find out right away about typos like `prise` instead of saving a product with no price change.

`"strip"` drops those fields and carries on. Use it when old clients send extra fields you can't break. Type errors and unsafe keys still fail in strip mode.

## Issues

```ts
interface Issue {
  code: IssueCode;
  path: string;    // "addresses.1.city"
  message: string;
  rule?: string;   // Mongoose validator kind, e.g. "required", "min", "enum"
}
```

| Code | Meaning |
|---|---|
| `invalid_body` | body isn't a JSON object, isn't valid JSON, or a Mixed value is nested more than 32 levels deep |
| `unsafe_key` | a prototype key, `$` key or dotted key |
| `unknown_field` | not in the schema |
| `forbidden_field` | in the schema, not in `allow` |
| `invalid_type` | wrong JavaScript type |
| `invalid_value` | a Mongoose validator failed; `rule` says which one |

Paths use Mongoose's dot style, with array indexes as segments.

## Things worth knowing

**`data` is your input, trimmed to the allowed fields.** It's not cast and has no defaults applied. `"A@B.COM"` stays uppercase even if the schema says `lowercase: true`. Mongoose applies setters and defaults when you call `create` or `save`, same as always.

**Required fields outside `allow` are skipped.** A `createdBy` that your handler fills in won't fail validation just because the client can't send it. The same goes for required fields inside sub-schemas and document arrays: with `allow: ["shipping.city"]`, a missing `shipping.trackingCode` isn't reported. Set it in your handler before you save.

Under the hood, sub-schemas are validated as a whole and errors for fields you didn't ask about are dropped. Asking Mongoose for several dotted paths into one sub-schema only checks the last of them (seen in 8.24 and 9.11), so validating the whole thing is the reliable option.

**`pre("validate")` hooks run.** mongoose-guard builds a throwaway document and calls `validate()` on it, so validate hooks and validators that read `this` behave like they do on a real save. Keep side effects out of those hooks.

**Async validators run on every request.** A uniqueness check that queries the database runs that query on every request, including ones a cheaper check could have rejected.

**Discriminators aren't supported yet.** Guard the concrete child model, not the base.

**`unique: true` is not a validator** in Mongoose, so duplicates still show up as an `E11000` error from MongoDB on save. Handle that where you save.

## License

MIT
