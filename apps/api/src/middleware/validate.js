import { HttpError } from '../utils/http.js';

// validate(schema) parses req.body with a zod schema and replaces it with the cleaned result.
export const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return next(new HttpError(400, 'Validation failed', result.error.flatten().fieldErrors));
  }
  req.body = result.data;
  next();
};
