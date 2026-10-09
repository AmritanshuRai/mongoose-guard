import type { AllowList } from "./allow.js";
import { join } from "./paths.js";
import { type FieldShape, type SchemaLike, shapeOf } from "./schema.js";
import { isPlainObject } from "./values.js";

interface SchemaField {
  path: string;
  shape: FieldShape;
}

const fieldCache = new WeakMap<SchemaLike, readonly SchemaField[]>();

function fieldsOf(schema: SchemaLike): readonly SchemaField[] {
  let fields = fieldCache.get(schema);
  if (!fields) {
    fields = Object.entries(schema.paths)
      .filter(([path]) => !path.includes("$*"))
      .map(([path, type]) => ({ path, shape: shapeOf(type) }));
    fieldCache.set(schema, fields);
  }
  return fields;
}

function readPath(source: Record<string, unknown>, path: string): unknown {
  let current: unknown = source;
  for (const segment of path.split(".")) {
    if (!isPlainObject(current)) return undefined;
    current = current[segment];
  }
  return current;
}

export function collectAllowedPaths(
  schema: SchemaLike,
  data: Record<string, unknown>,
  allow: AllowList,
  pattern = "",
  validation = "",
): string[] {
  const paths: string[] = [];

  for (const { path, shape } of fieldsOf(schema)) {
    const fieldPattern = join(pattern, path);
    const fieldValidation = join(validation, path);

    if (shape.kind === "subdocument") {
      const value = readPath(data, path);
      if (isPlainObject(value)) {
        paths.push(
          ...collectAllowedPaths(shape.schema, value, allow, fieldPattern, fieldValidation),
        );
      } else if (allow.covers(fieldPattern) || allow.leadsTo(fieldPattern)) {
        paths.push(fieldValidation);
      }
      continue;
    }

    if (allow.covers(fieldPattern)) paths.push(fieldValidation);
  }

  return paths;
}
