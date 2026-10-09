import type { AllowList } from "./allow.js";
import { join } from "./paths.js";
import { type FieldShape, resolveKey, type SchemaLike } from "./schema.js";
import type { Issue, IssueCode } from "./types.js";
import { checkScalar, describe, isPlainObject, unsafeKeyReason } from "./values.js";

const MAX_MIXED_DEPTH = 32;

interface Scope {
  schema: SchemaLike;
  prefix: string;
}

interface Location {
  path: string;
  pattern: string;
  validation: string | null;
}

export interface WalkResult {
  data: Record<string, unknown>;
  issues: Issue[];
  validationPaths: Set<string>;
}

export function walkBody(
  schema: SchemaLike,
  body: Record<string, unknown>,
  allow: AllowList,
  strip: boolean,
): WalkResult {
  const walker = new BodyWalker(allow, strip);
  const data = walker.object({ schema, prefix: "" }, body, {
    path: "",
    pattern: "",
    validation: "",
  });
  return { data, issues: walker.issues, validationPaths: walker.validationPaths };
}

class BodyWalker {
  readonly issues: Issue[] = [];
  readonly validationPaths = new Set<string>();

  constructor(
    private readonly allow: AllowList,
    private readonly strip: boolean,
  ) {}

  object(scope: Scope, input: Record<string, unknown>, at: Location): Record<string, unknown> {
    const output: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(input)) {
      const path = join(at.path, key);
      const unsafe = unsafeKeyReason(key);
      if (unsafe) {
        this.report("unsafe_key", path, unsafe);
        continue;
      }

      const resolved = resolveKey(scope.schema, scope.prefix + key);
      if (resolved.kind === "unknown") {
        this.refuse("unknown_field", path, "Unknown field");
        continue;
      }

      const pattern = join(at.pattern, key);
      if (!this.allow.covers(pattern) && !this.allow.leadsTo(pattern)) {
        this.refuse("forbidden_field", path, "Field is not allowed");
        continue;
      }

      const child: Location = {
        path,
        pattern,
        validation: at.validation === null ? null : join(at.validation, key),
      };

      output[key] =
        resolved.kind === "nested"
          ? this.nested({ schema: scope.schema, prefix: `${resolved.local}.` }, value, child)
          : this.value(resolved.shape, value, child);
    }

    return output;
  }

  private nested(scope: Scope, value: unknown, at: Location): unknown {
    if (!isPlainObject(value)) return this.typeMismatch(at.path, "object", value);
    return this.object(scope, value, at);
  }

  private value(shape: FieldShape, value: unknown, at: Location): unknown {
    if (value === null) {
      this.track(at.validation);
      return null;
    }

    switch (shape.kind) {
      case "scalar": {
        const expected = checkScalar(shape.instance, value);
        if (expected) return this.typeMismatch(at.path, expected, value);
        this.track(at.validation);
        return value;
      }

      case "mixed":
        this.scanMixed(value, at.path, 0);
        this.track(at.validation);
        return value;

      case "subdocument":
        if (!isPlainObject(value)) return this.typeMismatch(at.path, "object", value);
        return this.object({ schema: shape.schema, prefix: "" }, value, at);

      case "documentArray":
        if (!Array.isArray(value)) return this.typeMismatch(at.path, "array", value);
        this.track(at.validation);
        return value.map((element, index) => {
          const path = join(at.path, index);
          if (!isPlainObject(element)) return this.typeMismatch(path, "object", element);
          return this.object({ schema: shape.schema, prefix: "" }, element, {
            path,
            pattern: at.pattern,
            validation: null,
          });
        });

      case "array":
        if (!Array.isArray(value)) return this.typeMismatch(at.path, "array", value);
        this.track(at.validation);
        return value.map((element, index) =>
          this.value(shape.element, element, {
            path: join(at.path, index),
            pattern: at.pattern,
            validation: null,
          }),
        );

      case "map":
        return this.map(shape.value, value, at);
    }
  }

  private map(valueShape: FieldShape, value: unknown, at: Location): unknown {
    if (!isPlainObject(value)) return this.typeMismatch(at.path, "object", value);

    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const path = join(at.path, key);
      const unsafe = unsafeKeyReason(key);
      if (unsafe) {
        this.report("unsafe_key", path, unsafe);
        continue;
      }

      output[key] = this.value(valueShape, entry, { path, pattern: at.pattern, validation: null });
      this.track(at.validation === null ? null : join(at.validation, key));
    }
    return output;
  }

  private scanMixed(value: unknown, path: string, depth: number): void {
    if (depth > MAX_MIXED_DEPTH) {
      this.report("invalid_body", path, "Value is nested too deeply");
      return;
    }

    if (Array.isArray(value)) {
      for (const [index, element] of value.entries()) {
        this.scanMixed(element, join(path, index), depth + 1);
      }
      return;
    }
    if (!isPlainObject(value)) return;

    for (const [key, entry] of Object.entries(value)) {
      const unsafe = unsafeKeyReason(key);
      if (unsafe) this.report("unsafe_key", join(path, key), unsafe);
      else this.scanMixed(entry, join(path, key), depth + 1);
    }
  }

  private typeMismatch(path: string, expected: string, value: unknown): undefined {
    this.report("invalid_type", path, `Expected ${expected}, received ${describe(value)}`);
    return undefined;
  }

  private refuse(code: IssueCode, path: string, message: string): void {
    if (!this.strip) this.report(code, path, message);
  }

  private report(code: IssueCode, path: string, message: string): void {
    this.issues.push({ code, path, message });
  }

  private track(validationPath: string | null): void {
    if (validationPath !== null) this.validationPaths.add(validationPath);
  }
}
