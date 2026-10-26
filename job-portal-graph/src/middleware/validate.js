/**
 * src/middleware/validate.js — zod validation middleware (plan §9.1).
 *
 * A failure becomes 400 VALIDATION_FAILED with `details: [{ path, message }]`
 * so the client can map errors back onto the exact field.
 */
import { Errors } from '../lib/errors.js';

export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(
        Errors.validation(
          'Request validation failed.',
          result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        ),
      );
    }
    req.body = result.data;
    next();
  };
}
