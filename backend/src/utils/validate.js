const { z } = require('zod');
const AppError = require('./AppError');

/** Validate req[source] with a zod schema; replaces it with the parsed (typed, stripped) value. */
const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source] ?? {});
  if (!result.success) {
    const first = result.error.issues[0];
    const field = first.path.join('.');
    return next(new AppError(field ? `${field}: ${first.message}` : first.message, 400, 'VALIDATION_ERROR'));
  }
  if (source === 'query') {
    // Express 5 makes req.query read-only; keep parsed copy separately
    req.validatedQuery = result.data;
  } else {
    req[source] = result.data;
  }
  next();
};

const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);
const password = z.string().min(8, 'Password must be at least 8 characters.').max(128);

module.exports = { z, validate, email, password };
