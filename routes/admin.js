const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const tokens = new Set();

function isAdmin(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  return tokens.has(token);
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

router.post('/auth', (req, res) => {
  const { password } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false });
  }
  const token = crypto.randomUUID();
  tokens.add(token);
  res.json({ success: true, token });
});

module.exports = router;
module.exports.requireAdmin = requireAdmin;
module.exports.isAdmin = isAdmin;
