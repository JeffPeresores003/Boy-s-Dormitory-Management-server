// Server/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const pool = require('../config/config');

// Protect routes - verify JWT token
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Mock mode fallback (when DB is unavailable)
    if (decoded.mock) {
      req.user = { id: 1, name: 'System Administrator', email: 'admin@bisu.edu.ph', role: 'admin' };
      return next();
    }

    const [rows] = await pool.execute(
      "SELECT id, name, email, role FROM Users WHERE id = ?",
      [decoded.id]
    );

    if (!rows || rows.length === 0) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }

    req.user = rows[0];
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized, invalid token' });
  }
};

// Authorize by role
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Not authorized for this action' });
    }
    next();
  };
};

module.exports = { protect, authorize };
