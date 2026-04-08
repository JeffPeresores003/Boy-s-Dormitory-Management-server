// Server/routes/maintenance.routes.js
const express = require('express');
const pool = require('../config/config');
const { protect, authorize } = require('../middleware/authMiddleware');
const router = express.Router();

// All routes require admin authentication
router.use(protect);
router.use(authorize('admin'));

// ---------------- Get All Maintenance Requests ---------------- //
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];

    if (status) {
      whereConditions.push("m.status = ?");
      params.push(status);
    }
    if (search) {
      whereConditions.push("m.title LIKE ?");
      params.push(`%${search}%`);
    }

    const whereClause = whereConditions.length > 0 ? "WHERE " + whereConditions.join(" AND ") : "";

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as total FROM MaintenanceRequests m ${whereClause}`,
      params
    );
    const total = countRows[0].total;

    const [requests] = await pool.execute(
      `SELECT m.*, t.id as tenantPk, t.firstName, t.lastName, t.tenantNumber,
              r.id as roomPk, r.roomNumber, r.floor as roomFloor
       FROM MaintenanceRequests m
       LEFT JOIN Tenants t ON m.tenantId = t.id
       LEFT JOIN Rooms r ON m.roomId = r.id
       ${whereClause}
       ORDER BY m.createdAt DESC
       LIMIT ${parseInt(limit)} OFFSET ${offset}`,
      params
    );

    const formattedRequests = requests.map(r => ({
      id: r.id,
      tenantId: r.tenantId,
      roomId: r.roomId,
      title: r.title,
      description: r.description,
      status: r.status,
      adminNotes: r.adminNotes,
      resolvedAt: r.resolvedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      tenant: r.tenantPk ? {
        id: r.tenantPk,
        firstName: r.firstName,
        lastName: r.lastName,
        tenantNumber: r.tenantNumber,
      } : null,
      room: r.roomPk ? {
        id: r.roomPk,
        roomNumber: r.roomNumber,
        floor: r.roomFloor,
      } : null,
    }));

    res.json({
      requests: formattedRequests,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error("Get requests error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Get Tenant Maintenance Requests ---------------- //
router.get("/tenant/:tenantId", async (req, res) => {
  try {
    const [requests] = await pool.execute(
      `SELECT m.*, r.id as roomPk, r.roomNumber
       FROM MaintenanceRequests m
       LEFT JOIN Rooms r ON m.roomId = r.id
       WHERE m.tenantId = ?
       ORDER BY m.createdAt DESC`,
      [req.params.tenantId]
    );

    const formattedRequests = requests.map(r => ({
      ...r,
      room: r.roomPk ? { id: r.roomPk, roomNumber: r.roomNumber } : null,
    }));

    res.json(formattedRequests);
  } catch (error) {
    console.error("Get tenant requests error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Create Maintenance Request ---------------- //
router.post("/", async (req, res) => {
  try {
    const { tenantId, roomId, title, description } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description are required' });
    }

    // Validate tenant exists
    if (tenantId) {
      const [tenantCheck] = await pool.execute("SELECT id FROM Tenants WHERE id = ?", [tenantId]);
      if (!tenantCheck || tenantCheck.length === 0) {
        return res.status(404).json({ message: 'Tenant not found' });
      }
    }

    // Validate room exists
    if (roomId) {
      const [roomCheck] = await pool.execute("SELECT id FROM Rooms WHERE id = ?", [roomId]);
      if (!roomCheck || roomCheck.length === 0) {
        return res.status(404).json({ message: 'Room not found' });
      }
    }

    const [result] = await pool.execute(
      `INSERT INTO MaintenanceRequests (tenantId, roomId, title, description, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [tenantId || null, roomId || null, title, description]
    );

    const [newRequest] = await pool.execute(
      `SELECT m.*, t.firstName, t.lastName, r.roomNumber
       FROM MaintenanceRequests m
       LEFT JOIN Tenants t ON m.tenantId = t.id
       LEFT JOIN Rooms r ON m.roomId = r.id
       WHERE m.id = ?`,
      [result.insertId]
    );

    const r = newRequest[0];
    res.status(201).json({
      id: r.id,
      tenantId: r.tenantId,
      roomId: r.roomId,
      title: r.title,
      description: r.description,
      status: r.status,
      adminNotes: r.adminNotes,
      resolvedAt: r.resolvedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      tenant: r.tenantId ? { id: r.tenantId, firstName: r.firstName, lastName: r.lastName } : null,
      room: r.roomId ? { id: r.roomId, roomNumber: r.roomNumber } : null,
    });
  } catch (error) {
    console.error("Create request error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Update Maintenance Request ---------------- //
router.put("/:id", async (req, res) => {
  try {
    const [existing] = await pool.execute("SELECT * FROM MaintenanceRequests WHERE id = ?", [req.params.id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ message: 'Request not found' });
    }

    const request = existing[0];
    const { status, adminNotes } = req.body;

    const newStatus = status ?? request.status;
    const newAdminNotes = adminNotes !== undefined ? adminNotes : request.adminNotes;
    const resolvedAt = newStatus === 'resolved' ? new Date() : request.resolvedAt;

    await pool.execute(
      `UPDATE MaintenanceRequests SET status = ?, adminNotes = ?, resolvedAt = ?, updatedAt = NOW() WHERE id = ?`,
      [newStatus, newAdminNotes, resolvedAt, req.params.id]
    );

    const [updated] = await pool.execute(
      `SELECT m.*, t.id as tenantPk, t.firstName, t.lastName, r.id as roomPk, r.roomNumber
       FROM MaintenanceRequests m
       LEFT JOIN Tenants t ON m.tenantId = t.id
       LEFT JOIN Rooms r ON m.roomId = r.id
       WHERE m.id = ?`,
      [req.params.id]
    );

    const r = updated[0];
    res.json({
      id: r.id,
      tenantId: r.tenantId,
      roomId: r.roomId,
      title: r.title,
      description: r.description,
      status: r.status,
      adminNotes: r.adminNotes,
      resolvedAt: r.resolvedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      tenant: r.tenantPk ? { id: r.tenantPk, firstName: r.firstName, lastName: r.lastName } : null,
      room: r.roomPk ? { id: r.roomPk, roomNumber: r.roomNumber } : null,
    });
  } catch (error) {
    console.error("Update request error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Delete Maintenance Request ---------------- //
router.delete("/:id", async (req, res) => {
  try {
    const [existing] = await pool.execute("SELECT id FROM MaintenanceRequests WHERE id = ?", [req.params.id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ message: 'Request not found' });
    }

    await pool.execute("DELETE FROM MaintenanceRequests WHERE id = ?", [req.params.id]);
    res.json({ message: 'Request deleted successfully' });
  } catch (error) {
    console.error("Delete request error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
