# Changelog

## 0.1.0

First release.

- `createGuard` and `validateBody` validate a request body against a Mongoose model with a per-route `allow` list.
- Strict type checks with no casting, for every built-in SchemaType including arrays, Maps and sub-schemas.
- Rejects `__proto__`, `$` and dotted keys anywhere in the body.
- `partial` mode for PATCH routes and `unknown: "strip"` for lenient routes.
- Express adapter (`mongoose-guard/express`) and Web `Request` adapter (`mongoose-guard/web`).
- Tested against Mongoose 8 and 9, Express 4 and 5.
