// Server/routes/auth.routes.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/config');
const router = express.Router();

// ---------------- User Login ---------------- //
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const [rows] = await pool.execute('CALL sp_GetUserByEmail(?)', [email]);
    const user = rows[0] && rows[0].length > 0 ? rows[0][0] : null;

    if (!user) {
      // Determine whether the submitted password matches any existing account.
      // If it matches another account, only the email is invalid.
      const [passwordRows] = await pool.execute('SELECT password FROM Users');
      let passwordExists = false;

      for (const row of passwordRows) {
        if (await bcrypt.compare(password, row.password)) {
          passwordExists = true;
          break;
        }
      }

      return res.status(401).json({
        message: passwordExists ? 'Incorrect Email' : 'Both email and password are incorrect',
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Incorrect Password' });
    }

    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Register (admin creates accounts) ---------------- //
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // Check if email already exists
    const [existing] = await pool.execute(
      "SELECT id FROM Users WHERE email = ?",
      [email]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const [result] = await pool.execute(
      "INSERT INTO Users (name, email, password, role, createdAt, updatedAt) VALUES (?, ?, ?, ?, NOW(), NOW())",
      [name, email, hashedPassword, role || 'admin']
    );

    res.status(201).json({
      user: { id: result.insertId, name, email, role: role || 'admin' },
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Get Current User ---------------- //
router.get("/me", async (req, res) => {
  try {
    // Extract token
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
      return res.status(401).json({ message: 'Not authorized, no token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [userRows] = await pool.execute(
      "SELECT id, name, email, role FROM Users WHERE id = ?",
      [decoded.id]
    );

    if (!userRows || userRows.length === 0) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }

    const user = userRows[0];

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    console.error("Get me error:", error);
    res.status(401).json({ message: 'Not authorized, invalid token' });
  }
});

// ---------------- Forgot Password ---------------- //
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const [userRows] = await pool.execute(
      "SELECT id FROM Users WHERE email = ?",
      [email]
    );

    if (!userRows || userRows.length === 0) {
      return res.status(404).json({ message: 'No account with that email' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expire = new Date(Date.now() + 30 * 60 * 1000);

    await pool.execute(
      "UPDATE Users SET resetPasswordToken = ?, resetPasswordExpire = ? WHERE email = ?",
      [hashedToken, expire, email]
    );

    res.json({ message: 'Password reset token generated', resetToken });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Reset Password ---------------- //
router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: 'Token and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const [userRows] = await pool.execute(
      "SELECT id, resetPasswordExpire FROM Users WHERE resetPasswordToken = ?",
      [hashedToken]
    );

    if (!userRows || userRows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const user = userRows[0];

    if (!user.resetPasswordExpire || new Date(user.resetPasswordExpire) < new Date()) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    await pool.execute(
      "UPDATE Users SET password = ?, resetPasswordToken = NULL, resetPasswordExpire = NULL, updatedAt = NOW() WHERE id = ?",
      [hashedPassword, user.id]
    );

    res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Change Password ---------------- //
router.put("/change-password", async (req, res) => {
  try {
    // Extract token
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
      return res.status(401).json({ message: 'Not authorized, no token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    const [userRows] = await pool.execute(
      "SELECT id, password FROM Users WHERE id = ?",
      [decoded.id]
    );

    if (!userRows || userRows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = userRows[0];
    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await pool.execute(
      "UPDATE Users SET password = ?, updatedAt = NOW() WHERE id = ?",
      [hashedPassword, user.id]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
