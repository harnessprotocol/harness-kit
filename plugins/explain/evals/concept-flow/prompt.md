---
max_turns: 8
runs: 1
timeout_seconds: 180
model: claude-haiku-5-5
allowed_tools: [Skill, Read, Glob, Grep]
tags: [explain, medium-scope, concept]
---

Walk me through the authentication flow in this project: what it does, how its parts connect, and where to start if I need to change it.

The files are not on disk. Treat the code below as the project contents.

`src/middleware/auth.js`:

```js
const jwt = require('jsonwebtoken');

/**
 * Express middleware that validates a Bearer JWT token.
 * Attaches the decoded payload to req.user on success.
 * Returns 401 if the token is missing or invalid.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { authenticate };
```

`src/routes/users.js`:

```js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const db = require('../db');

// List all active users
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await db.query('SELECT id, name, email FROM users WHERE active = true');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Get a single user by ID — note: missing try/catch on db.query
router.get('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const result = await db.query('SELECT id, name, email FROM users WHERE id = $1', [id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(result.rows[0]);
});

// Create a new user — note: no input validation
router.post('/', authenticate, async (req, res) => {
  const { name, email } = req.body;
  const result = await db.query(
    'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, name, email',
    [name, email]
  );
  res.status(201).json(result.rows[0]);
});

module.exports = router;
```
