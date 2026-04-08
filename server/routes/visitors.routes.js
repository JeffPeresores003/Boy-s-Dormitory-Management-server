// Server/routes/visitors.routes.js
const express = require('express');
const pool = require('../config/config');
const { protect, authorize } = require('../middleware/authMiddleware');
const router = express.Router();

// All routes require admin authentication
router.use(protect);
router.use(authorize('admin'));

// ---------------- Get All Visitors ---------------- //
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', date = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];

    if (search) {
      whereConditions.push("v.visitorName LIKE ?");
      params.push(`%${search}%`);
    }
    if (date) {
      whereConditions.push("DATE(v.timeIn) = ?");
      params.push(date);
    }

    const whereClause = whereConditions.length > 0 ? "WHERE " + whereConditions.join(" AND ") : "";

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as total FROM Visitors v ${whereClause}`, params
    );
    const total = countRows[0].total;

    const [visitors] = await pool.execute(
      `SELECT v.*, t.id as tenantPk, t.firstName as tenantFirstName, t.lastName as tenantLastName, t.tenantNumber, t.type as tenantType
       FROM Visitors v
       LEFT JOIN Tenants t ON v.tenantVisitedId = t.id
       ${whereClause}
       ORDER BY v.timeIn DESC
       LIMIT ${parseInt(limit)} OFFSET ${offset}`,
      params
    );

    const formattedVisitors = visitors.map(v => ({
      id: v.id,
      visitorName: v.visitorName,
      tenantVisitedId: v.tenantVisitedId,
      purpose: v.purpose,
      timeIn: v.timeIn,
      timeOut: v.timeOut,
      recordedBy: v.recordedBy,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
      tenantVisited: v.tenantPk ? {
        id: v.tenantPk,
        firstName: v.tenantFirstName,
        lastName: v.tenantLastName,
        tenantNumber: v.tenantNumber,
        type: v.tenantType,
      } : null,
    }));

    res.json({
      visitors: formattedVisitors,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error("Get visitors error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Create Visitor ---------------- //
router.post("/", async (req, res) => {
  try {
    const { visitorName, tenantVisitedId, purpose } = req.body;

    if (!visitorName || !tenantVisitedId || !purpose) {
      return res.status(400).json({ message: 'Visitor name, tenant visited, and purpose are required' });
    }

    const [tenantRows] = await pool.execute("SELECT id FROM Tenants WHERE id = ?", [tenantVisitedId]);
    if (!tenantRows || tenantRows.length === 0) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    const [result] = await pool.execute(
      `INSERT INTO Visitors (visitorName, tenantVisitedId, purpose, recordedBy, timeIn, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, NOW(), NOW(), NOW())`,
      [visitorName, tenantVisitedId, purpose, req.user.id]
    );

    const [newVisitor] = await pool.execute(
      `SELECT v.*, t.firstName as tenantFirstName, t.lastName as tenantLastName
       FROM Visitors v
       LEFT JOIN Tenants t ON v.tenantVisitedId = t.id
       WHERE v.id = ?`,
      [result.insertId]
    );

    const v = newVisitor[0];
    res.status(201).json({
      id: v.id,
      visitorName: v.visitorName,
      tenantVisitedId: v.tenantVisitedId,
      purpose: v.purpose,
      timeIn: v.timeIn,
      timeOut: v.timeOut,
      recordedBy: v.recordedBy,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
      tenantVisited: {
        id: v.tenantVisitedId,
        firstName: v.tenantFirstName,
        lastName: v.tenantLastName,
      },
    });
  } catch (error) {
    console.error("Create visitor error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Checkout Visitor ---------------- //
router.put("/:id/checkout", async (req, res) => {
  try {
    const [existing] = await pool.execute("SELECT * FROM Visitors WHERE id = ?", [req.params.id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ message: 'Visitor log not found' });
    }

    if (existing[0].timeOut) {
      return res.status(400).json({ message: 'Visitor already checked out' });
    }

    await pool.execute("UPDATE Visitors SET timeOut = NOW(), updatedAt = NOW() WHERE id = ?", [req.params.id]);

    const [updated] = await pool.execute("SELECT * FROM Visitors WHERE id = ?", [req.params.id]);
    res.json(updated[0]);
  } catch (error) {
    console.error("Checkout visitor error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Delete Visitor ---------------- //
router.delete("/:id", async (req, res) => {
  try {
    const [existing] = await pool.execute("SELECT id FROM Visitors WHERE id = ?", [req.params.id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ message: 'Visitor log not found' });
    }

    await pool.execute("DELETE FROM Visitors WHERE id = ?", [req.params.id]);
    res.json({ message: 'Visitor log deleted successfully' });
  } catch (error) {
    console.error("Delete visitor error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
