import { compileAllowList, GuardConfigError } from "./allow.js";
import { collectAllowedPaths } from "./coverage.js";
import { validateWithModel } from "./model-validation.js";
import { asSchema } from "./schema.js";
import type { Guard, GuardableModel, GuardOptions, GuardResult, Issue } from "./types.js";
import { isPlainObject } from "./values.js";
import { walkBody } from "./walk.js";

const UNKNOWN_POLICIES = new Set(["reject", "strip"]);

const failure = (issues: Issue[]): { ok: false; issues: Issue[] } => ({ ok: false, issues });

const withoutIndexes = (path: string): string =>
  path
    .split(".")
    .filter((segment) => !/^\d+$/.test(segment))
    .join(".");

export function createGuard<TData = Record<string, unknown>>(
  model: GuardableModel,
  options: GuardOptions,
): Guard<TData> {
  const schema = asSchema(model.schema);
  const allow = compileAllowList(schema, options.allow);
  const partial = options.partial ?? false;
  const unknown = options.unknown ?? "reject";

  if (!UNKNOWN_POLICIES.has(unknown)) {
    throw new GuardConfigError(`mongoose-guard: \`unknown\` must be "reject" or "strip"`);
  }
  const strip = unknown === "strip";
  const isReportable = (path: string) => allow.covers(withoutIndexes(path));

  return {
    async validate(body: unknown): Promise<GuardResult<TData>> {
      if (!isPlainObject(body)) {
        return failure([{ code: "invalid_body", path: "", message: "Expected a JSON object" }]);
      }

      const walked = walkBody(schema, body, allow, strip);
      if (walked.issues.length > 0) return failure(walked.issues);

      const paths = new Set(walked.validationPaths);
      if (!partial) {
        for (const path of collectAllowedPaths(schema, walked.data, allow)) paths.add(path);
      }

      const issues = await validateWithModel(model, schema, walked.data, paths, isReportable);
      if (issues.length > 0) return failure(issues);

      return { ok: true, data: walked.data as TData };
    },
  };
}

export async function validateBody<TData = Record<string, unknown>>(
  model: GuardableModel,
  body: unknown,
  options: GuardOptions,
): Promise<GuardResult<TData>> {
  return createGuard<TData>(model, options).validate(body);
}
