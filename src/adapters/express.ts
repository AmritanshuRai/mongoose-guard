import type { NextFunction, Request, RequestHandler, Response } from "express";
import { createGuard } from "../guard.js";
import type { GuardableModel, GuardOptions, Issue } from "../types.js";

declare global {
  namespace Express {
    interface Request {
      validated?: Record<string, unknown>;
    }
  }
}

export type InvalidHandler = (
  issues: Issue[],
  req: Request,
  res: Response,
  next: NextFunction,
) => void;

export interface ExpressGuardOptions extends GuardOptions {
  onInvalid?: InvalidHandler;
}

const respondWith400: InvalidHandler = (issues, _req, res) => {
  res.status(400).json({ errors: issues });
};

export function guard(model: GuardableModel, options: ExpressGuardOptions): RequestHandler {
  const { onInvalid = respondWith400, ...guardOptions } = options;
  const compiled = createGuard(model, guardOptions);

  return async (req, res, next) => {
    let result: Awaited<ReturnType<typeof compiled.validate>>;
    try {
      result = await compiled.validate(req.body);
    } catch (error) {
      next(error);
      return;
    }

    if (!result.ok) {
      onInvalid(result.issues, req, res, next);
      return;
    }

    req.validated = result.data;
    next();
  };
}

export type { GuardOptions, Issue } from "../types.js";
