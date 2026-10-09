import { resolveKey, type SchemaLike } from "./schema.js";

export class GuardConfigError extends Error {
  override name = "GuardConfigError";
}

export interface AllowList {
  covers(pattern: string): boolean;
  leadsTo(pattern: string): boolean;
}

export function compileAllowList(schema: SchemaLike, entries: readonly string[]): AllowList {
  if (!Array.isArray(entries)) {
    throw new GuardConfigError("mongoose-guard: `allow` must be an array of field paths");
  }

  const covered = new Set<string>();
  const ancestors = new Set<string>();

  for (const entry of entries) {
    assertResolvable(schema, entry);
    covered.add(entry);

    const segments = entry.split(".");
    for (let end = 1; end < segments.length; end++) {
      ancestors.add(segments.slice(0, end).join("."));
    }
  }

  return {
    covers(pattern) {
      let current = pattern;
      while (true) {
        if (covered.has(current)) return true;
        const cut = current.lastIndexOf(".");
        if (cut === -1) return false;
        current = current.slice(0, cut);
      }
    },
    leadsTo: (pattern) => ancestors.has(pattern),
  };
}

function assertResolvable(schema: SchemaLike, entry: unknown): asserts entry is string {
  if (typeof entry !== "string" || entry.split(".").includes("")) {
    throw new GuardConfigError(`mongoose-guard: invalid allow entry ${JSON.stringify(entry)}`);
  }

  const segments = entry.split(".");
  let scope = schema;
  let prefix = "";
  let walked = "";

  for (const [index, segment] of segments.entries()) {
    walked = walked ? `${walked}.${segment}` : segment;
    const resolved = resolveKey(scope, prefix + segment);

    if (resolved.kind === "unknown") {
      throw new GuardConfigError(
        `mongoose-guard: allow entry "${entry}" does not match the schema ("${walked}" not found)`,
      );
    }
    if (resolved.kind === "nested") {
      prefix = `${resolved.local}.`;
      continue;
    }
    if (index === segments.length - 1) return;

    const { shape } = resolved;
    if (shape.kind !== "subdocument" && shape.kind !== "documentArray") {
      throw new GuardConfigError(
        `mongoose-guard: allow entry "${entry}" reaches inside "${walked}", which has no named fields`,
      );
    }
    scope = shape.schema;
    prefix = "";
  }
}
