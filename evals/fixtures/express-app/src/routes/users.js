const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const db = require("../db");

// List all active users
router.get("/", authenticate, async (req, res) => {
  try {
    const result = await db.query("SELECT id, name, email FROM users WHERE active = true");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

// Get a single user by ID — note: missing try/catch on db.query
router.get("/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  const result = await db.query("SELECT id, name, email FROM users WHERE id = $1", [id]);
  if (!result.rows.length) return res.status(404).json({ error: "Not found" });
  res.json(result.rows[0]);
});

// Create a new user — note: no input validation
router.post("/", authenticate, async (req, res) => {
  const { name, email } = req.body;
  const result = await db.query(
    "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, name, email",
    [name, email],
  );
  res.status(201).json(result.rows[0]);
});

module.exports = router;
