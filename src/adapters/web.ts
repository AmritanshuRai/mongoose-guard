import { createGuard } from "../guard.js";
import type { GuardableModel, GuardOptions, GuardResult, Issue } from "../types.js";

export type RequestGuard<TData = Record<string, unknown>> = (
  request: Request,
) => Promise<GuardResult<TData>>;

const invalidJson = (): GuardResult<never> => ({
  ok: false,
  issues: [{ code: "invalid_body", path: "", message: "Request body must be valid JSON" }],
});

export function guard<TData = Record<string, unknown>>(
  model: GuardableModel,
  options: GuardOptions,
): RequestGuard<TData> {
  const compiled = createGuard<TData>(model, options);

  return async (request) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return invalidJson();
    }
    return compiled.validate(body);
  };
}

export function invalidResponse(issues: Issue[], init: ResponseInit = {}): Response {
  return Response.json({ errors: issues }, { status: 400, ...init });
}

export type { GuardOptions, GuardResult, Issue } from "../types.js";
