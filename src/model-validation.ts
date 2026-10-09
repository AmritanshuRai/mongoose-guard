import { type SchemaLike, subdocumentRoot } from "./schema.js";
import type { GuardableModel, Issue } from "./types.js";

interface MongooseFieldError {
  name?: string;
  kind?: string;
  message?: string;
}

interface MongooseValidationError {
  name: "ValidationError";
  errors: Record<string, MongooseFieldError>;
}

function isValidationError(error: unknown): error is MongooseValidationError {
  return (
    error instanceof Error &&
    error.name === "ValidationError" &&
    typeof (error as Partial<MongooseValidationError>).errors === "object"
  );
}

function toIssue(path: string, error: MongooseFieldError): Issue {
  const issue: Issue = {
    code: error.name === "CastError" ? "invalid_type" : "invalid_value",
    path,
    message: error.message ?? "Invalid value",
  };
  if (error.kind) issue.rule = error.kind;
  return issue;
}

function isUnder(path: string, parents: Iterable<string>): boolean {
  for (const parent of parents) {
    if (path === parent || path.startsWith(`${parent}.`)) return true;
  }
  return false;
}

export async function validateWithModel(
  Model: GuardableModel,
  schema: SchemaLike,
  data: Record<string, unknown>,
  requested: ReadonlySet<string>,
  isReportable: (path: string) => boolean,
): Promise<Issue[]> {
  if (requested.size === 0) return [];

  const roots = new Set([...requested].map((path) => subdocumentRoot(schema, path)));

  try {
    await new Model(data).validate([...roots]);
    return [];
  } catch (error) {
    if (!isValidationError(error)) throw error;
    return Object.entries(error.errors)
      .filter(([path]) => roots.has(path) || (isUnder(path, requested) && isReportable(path)))
      .map(([path, fieldError]) => toIssue(path, fieldError));
  }
}
