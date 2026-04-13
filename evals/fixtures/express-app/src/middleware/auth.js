const jwt = require("jsonwebtoken");

/**
 * Express middleware that validates a Bearer JWT token.
 * Attaches the decoded payload to req.user on success.
 * Returns 401 if the token is missing or invalid.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { authenticate };
