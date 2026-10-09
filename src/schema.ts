export interface SchemaTypeLike {
  instance: string;
  schema?: SchemaLike;
  $isSingleNested?: boolean;
  $isMongooseDocumentArray?: boolean;
  $isMongooseArray?: boolean;
  embeddedSchemaType?: SchemaTypeLike;
  caster?: SchemaTypeLike;
  $__schemaType?: SchemaTypeLike;
}

export interface SchemaLike {
  paths: Record<string, SchemaTypeLike>;
  path(path: string): SchemaTypeLike | undefined;
  pathType(path: string): string;
}

export type FieldShape =
  | { kind: "scalar"; instance: string }
  | { kind: "mixed" }
  | { kind: "subdocument"; schema: SchemaLike }
  | { kind: "documentArray"; schema: SchemaLike }
  | { kind: "array"; element: FieldShape }
  | { kind: "map"; value: FieldShape };

export type Resolved =
  | { kind: "nested"; local: string }
  | { kind: "field"; shape: FieldShape }
  | { kind: "unknown" };

const MIXED: FieldShape = { kind: "mixed" };

export function shapeOf(type: SchemaTypeLike | undefined): FieldShape {
  if (!type || type.instance === "Mixed") return MIXED;

  if (type.$isMongooseDocumentArray && type.schema) {
    return { kind: "documentArray", schema: type.schema };
  }
  if (type.$isSingleNested && type.schema) {
    return { kind: "subdocument", schema: type.schema };
  }
  if (type.$isMongooseArray) {
    return { kind: "array", element: shapeOf(type.embeddedSchemaType ?? type.caster) };
  }
  if (type.instance === "Map") {
    return { kind: "map", value: shapeOf(type.$__schemaType) };
  }
  return { kind: "scalar", instance: type.instance };
}

export function resolveKey(schema: SchemaLike, local: string): Resolved {
  const pathType = schema.pathType(local);

  if (pathType === "nested") return { kind: "nested", local };
  if (pathType === "real") return { kind: "field", shape: shapeOf(schema.path(local)) };
  return { kind: "unknown" };
}

export function asSchema(schema: object): SchemaLike {
  const candidate = schema as Partial<SchemaLike>;
  if (
    typeof candidate.path !== "function" ||
    typeof candidate.pathType !== "function" ||
    typeof candidate.paths !== "object"
  ) {
    throw new TypeError("mongoose-guard: expected a Mongoose model with a schema");
  }
  return schema as SchemaLike;
}

export function subdocumentRoot(schema: SchemaLike, path: string): string {
  const segments = path.split(".");
  let local = "";

  for (const segment of segments.slice(0, -1)) {
    local = local ? `${local}.${segment}` : segment;
    const resolved = resolveKey(schema, local);
    if (resolved.kind === "nested") continue;
    if (resolved.kind === "field" && resolved.shape.kind === "subdocument") return local;
    return path;
  }
  return path;
}
