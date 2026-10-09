export type IssueCode =
  | "invalid_body"
  | "unsafe_key"
  | "unknown_field"
  | "forbidden_field"
  | "invalid_type"
  | "invalid_value";

export interface Issue {
  code: IssueCode;
  path: string;
  message: string;
  rule?: string;
}

export type GuardResult<TData = Record<string, unknown>> =
  | { ok: true; data: TData }
  | { ok: false; issues: Issue[] };

export type UnknownFieldPolicy = "reject" | "strip";

export interface GuardOptions {
  allow: readonly string[];
  partial?: boolean;
  unknown?: UnknownFieldPolicy;
}

export interface GuardableModel {
  readonly schema: object;
  new (
    doc?: Record<string, unknown>,
  ): {
    validate(pathsToValidate?: string[]): Promise<unknown>;
  };
}

export interface Guard<TData = Record<string, unknown>> {
  validate(body: unknown): Promise<GuardResult<TData>>;
}
