const PROTOTYPE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/i;
const OBJECT_ID = /^[\da-f]{24}$/i;
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const INTEGER = /^[+-]?\d+$/;

const INT32_MIN = -(2 ** 31);
const INT32_MAX = 2 ** 31 - 1;

interface ScalarRule {
  expected: string;
  accepts(value: unknown): boolean;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const hasBsonType = (value: unknown, bsonType: string): boolean =>
  typeof value === "object" &&
  value !== null &&
  (value as { _bsontype?: unknown })._bsontype === bsonType;

const number: ScalarRule = { expected: "number", accepts: isFiniteNumber };

const scalarRules: Record<string, ScalarRule> = {
  String: { expected: "string", accepts: (value) => typeof value === "string" },
  Number: number,
  Double: number,
  Int32: {
    expected: "32-bit integer",
    accepts: (value) =>
      Number.isInteger(value) && (value as number) >= INT32_MIN && (value as number) <= INT32_MAX,
  },
  BigInt: {
    expected: "integer",
    accepts: (value) =>
      typeof value === "bigint" ||
      Number.isSafeInteger(value) ||
      (typeof value === "string" && INTEGER.test(value)),
  },
  Boolean: { expected: "boolean", accepts: (value) => typeof value === "boolean" },
  Date: {
    expected: "ISO 8601 date",
    accepts: (value) =>
      value instanceof Date
        ? !Number.isNaN(value.getTime())
        : typeof value === "string" && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value)),
  },
  ObjectId: {
    expected: "ObjectId",
    accepts: (value) =>
      typeof value === "string" ? OBJECT_ID.test(value) : hasBsonType(value, "ObjectId"),
  },
  UUID: {
    expected: "UUID",
    accepts: (value) => typeof value === "string" && UUID.test(value),
  },
  Decimal128: {
    expected: "decimal",
    accepts: (value) =>
      isFiniteNumber(value) ||
      (typeof value === "string" && DECIMAL.test(value)) ||
      hasBsonType(value, "Decimal128"),
  },
  Buffer: {
    expected: "string or binary data",
    accepts: (value) => typeof value === "string" || value instanceof Uint8Array,
  },
};

export function checkScalar(instance: string, value: unknown): string | undefined {
  const rule = scalarRules[instance];
  if (!rule || rule.accepts(value)) return undefined;
  return rule.expected;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  return typeof value;
}

export function unsafeKeyReason(key: string): string | undefined {
  if (PROTOTYPE_KEYS.has(key)) return `Key "${key}" is reserved`;
  if (key.startsWith("$")) return "Keys starting with $ are not allowed";
  if (key.includes(".")) return "Keys containing a dot are not allowed";
  return undefined;
}
