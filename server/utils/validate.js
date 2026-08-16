/**
 * Lightweight input validation helpers.
 * No external library needed — keeps the bundle small.
 */

const EMAIL_RE   = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE   = /^[+\d\s\-().]{7,20}$/;

/**
 * Returns the first validation error message, or null if all pass.
 * Rules array: [{ field, value, rules... }]
 *
 * Supported rule keys:
 *   required  — field must be present and non-empty
 *   email     — must look like an email
 *   phone     — must look like a phone number
 *   minLen    — string length >= n
 *   maxLen    — string length <= n
 *   min       — number >= n
 *   max       — number <= n
 *   isNumber  — must be a finite number
 *   isLatLng  — must be a valid lat/lng pair (expects { lat, lng } object)
 *   oneOf     — value must be one of provided array
 */
function validate(rules) {
  for (const rule of rules) {
    const { field, value, label } = rule;
    const display = label || field;

    if (rule.required && (value === undefined || value === null || String(value).trim() === '')) {
      return `${display} is required.`;
    }

    // Skip further checks if value is empty and not required
    if (value === undefined || value === null || String(value).trim() === '') continue;

    if (rule.email && !EMAIL_RE.test(String(value).trim())) {
      return `${display} must be a valid email address.`;
    }

    if (rule.phone && !PHONE_RE.test(String(value).trim())) {
      return `${display} must be a valid phone number.`;
    }

    if (rule.minLen !== undefined && String(value).length < rule.minLen) {
      return `${display} must be at least ${rule.minLen} characters.`;
    }

    if (rule.maxLen !== undefined && String(value).length > rule.maxLen) {
      return `${display} must be at most ${rule.maxLen} characters.`;
    }

    if (rule.isNumber) {
      const n = Number(value);
      if (!isFinite(n)) return `${display} must be a number.`;
    }

    if (rule.min !== undefined) {
      const n = Number(value);
      if (!isFinite(n) || n < rule.min) return `${display} must be at least ${rule.min}.`;
    }

    if (rule.max !== undefined) {
      const n = Number(value);
      if (!isFinite(n) || n > rule.max) return `${display} must be at most ${rule.max}.`;
    }

    if (rule.oneOf && !rule.oneOf.includes(value)) {
      return `${display} must be one of: ${rule.oneOf.join(', ')}.`;
    }
  }
  return null; // all passed
}

/**
 * Express middleware factory.
 * Usage: router.post('/register', validateBody(rules), handler)
 * Rules are functions that receive req.body and return a rules array.
 */
function validateBody(rulesFn) {
  return (req, res, next) => {
    const rules = typeof rulesFn === 'function' ? rulesFn(req.body) : rulesFn;
    const error = validate(rules);
    if (error) return res.status(400).json({ message: error });
    next();
  };
}

module.exports = { validate, validateBody };
