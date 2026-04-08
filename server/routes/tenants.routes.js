// Server/routes/tenants.routes.js
const express = require('express');
const pool = require('../config/config');
const { protect, authorize } = require('../middleware/authMiddleware');
const { logActivity } = require('../utils/activityLogger');
const router = express.Router();

// All routes require admin authentication
router.use(protect);
router.use(authorize('admin'));

// ---------------- Get All Tenants ---------------- //
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status = '', type = '', remarks = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];

    if (search) {
      whereConditions.push("(t.firstName LIKE ? OR t.lastName LIKE ? OR t.tenantNumber LIKE ? OR t.email LIKE ?)");;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam);
    }

    if (status) {
      whereConditions.push("t.status = ?");
      params.push(status);
    }

    if (type) {
      whereConditions.push("t.type = ?");
      params.push(type);
    }

    if (remarks) {
      whereConditions.push("t.remarks = ?");
      params.push(remarks);
    }

    const whereClause = whereConditions.length > 0 ? "WHERE " + whereConditions.join(" AND ") : "";

    // Get total count
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as total FROM Tenants t ${whereClause}`,
      params
    );
    const total = countRows[0].total;

    // Get paginated tenants with room info
    const [tenants] = await pool.execute(
      `SELECT t.*, r.id as roomPk, r.roomNumber, r.floor as roomFloor
       FROM Tenants t
       LEFT JOIN Rooms r ON t.roomId = r.id
       ${whereClause}
       ORDER BY t.createdAt DESC
       LIMIT ${parseInt(limit)} OFFSET ${offset}`,
      params
    );

    // Format response
    const formattedTenants = tenants.map(t => ({
      ...t,
      room: t.roomNumber ? { id: t.roomPk, roomNumber: t.roomNumber, floor: t.roomFloor } : null,
    }));

    res.json({
      tenants: formattedTenants,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error("Get tenants error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Get Dropped/Graduated Tenants with Payment Tracking ---------------- //
router.get("/remarks/list", async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', remarks = '', paymentStatus = '' } = req.query;

    const whereConditions = ["t.remarks IS NOT NULL"]; 
    const params = [];

    if (search) {
      whereConditions.push("(t.firstName LIKE ? OR t.lastName LIKE ? OR t.tenantNumber LIKE ? OR t.email LIKE ?)");
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam);
    }

    if (remarks) {
      whereConditions.push("t.remarks = ?");
      params.push(remarks);
    }

    const whereClause = "WHERE " + whereConditions.join(" AND ");

    const [tenants] = await pool.execute(
      `SELECT t.*, r.id as roomPk, r.roomNumber, r.floor as roomFloor
       FROM Tenants t
       LEFT JOIN Rooms r ON t.roomId = r.id
       ${whereClause}
       ORDER BY t.updatedAt DESC`,
      params
    );

    const tenantsWithPayments = await Promise.all(
      tenants.map(async (tenant) => {
        const [latestPayment] = await pool.execute(
          `SELECT x.status, DATE_FORMAT(x.dueDate, '%Y-%m-%d') AS dueDate
           FROM (
             SELECT p.status, p.dueDate, p.id FROM Payments p WHERE p.tenantId = ?
             UNION ALL
             SELECT pr.status, pr.dueDate, pr.id FROM PaymentRecords pr WHERE pr.tenantId = ?
           ) x
           ORDER BY x.dueDate DESC, x.id DESC
           LIMIT 1`,
          [tenant.id, tenant.id]
        );

        return {
          ...tenant,
          paymentStatus: latestPayment.length ? latestPayment[0].status : 'no-record',
          latestDueDate: latestPayment.length ? latestPayment[0].dueDate : null,
          room: tenant.roomNumber
            ? { id: tenant.roomPk, roomNumber: tenant.roomNumber, floor: tenant.roomFloor }
            : tenant.lastRoomNumber
              ? { id: null, roomNumber: tenant.lastRoomNumber, floor: null }
              : null,
        };
      })
    );

    const filtered = paymentStatus
      ? tenantsWithPayments.filter((t) => t.paymentStatus === paymentStatus)
      : tenantsWithPayments;

    const p = parseInt(page);
    const l = parseInt(limit);
    const offset = (p - 1) * l;
    const paginated = filtered.slice(offset, offset + l);

    res.json({
      tenants: paginated,
      total: filtered.length,
      page: p,
      totalPages: Math.ceil(filtered.length / l) || 1,
    });
  } catch (error) {
    console.error("Get remarked tenants error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Get Single Tenant ---------------- //
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT t.*, r.roomNumber, r.floor as roomFloor
       FROM Tenants t
       LEFT JOIN Rooms r ON t.roomId = r.id
       WHERE t.id = ?`,
      [req.params.id]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    const tenant = rows[0];
    tenant.room = tenant.roomNumber ? { id: tenant.roomId, roomNumber: tenant.roomNumber, floor: tenant.roomFloor } : null;

    res.json(tenant);
  } catch (error) {
    console.error("Get tenant error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Helper to update room status based on occupancy
const updateRoomStatus = async (roomId) => {
  if (!roomId) return;
  const [roomRows] = await pool.execute("SELECT capacity FROM Rooms WHERE id = ?", [roomId]);
  if (!roomRows.length) return;
  const capacity = roomRows[0].capacity;
  const [countRows] = await pool.execute("SELECT COUNT(*) as count FROM Tenants WHERE roomId = ? AND status = 'active'", [roomId]);
  const occupants = countRows[0].count;
  const newStatus = occupants >= capacity ? 'full' : 'available';
  await pool.execute("UPDATE Rooms SET status = ?, updatedAt = NOW() WHERE id = ?", [newStatus, roomId]);
};

// ---------------- Create Tenant ---------------- //
router.post("/", async (req, res) => {
  try {
    const { firstName, lastName, email, contact, type, department, roomId, guardianName, guardianContact, remarks, amount, duration, payment } = req.body;

    if (!firstName || !lastName || !email || !contact || !type || !roomId || amount === undefined || amount === null || amount === '' || !duration) {
      return res.status(400).json({ message: 'First name, last name, email, contact, type, room, amount, and duration are required' });
    }

    if (!['student', 'staff', 'faculty'].includes(type)) {
      return res.status(400).json({ message: 'Type must be student, staff, or faculty' });
    }

    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: 'Amount must be a valid number greater than 0' });
    }

    if (!['1 sem', '2 sem'].includes(duration)) {
      return res.status(400).json({ message: 'Duration must be either 1 sem or 2 sem' });
    }

    // Verify room exists and has space
    const [roomRows] = await pool.execute("SELECT id, capacity, status FROM Rooms WHERE id = ?", [roomId]);
    if (!roomRows.length) {
      return res.status(400).json({ message: 'Selected room does not exist' });
    }
    const room = roomRows[0];
    const [occupantCount] = await pool.execute("SELECT COUNT(*) as count FROM Tenants WHERE roomId = ? AND status = 'active'", [roomId]);
    if (occupantCount[0].count >= room.capacity) {
      return res.status(400).json({ message: 'Selected room is already full' });
    }

    // Check if email already exists
    const [existing] = await pool.execute(
      "SELECT id FROM Tenants WHERE email = ?",
      [email]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    // Auto-generate tenantNumber (TN-0001, TN-0002, ...)
    const [lastTenant] = await pool.execute("SELECT tenantNumber FROM Tenants ORDER BY id DESC LIMIT 1");
    let nextNum = 1;
    if (lastTenant.length > 0 && lastTenant[0].tenantNumber) {
      const match = lastTenant[0].tenantNumber.match(/TN-(\d+)/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }
    const tenantNumber = `TN-${String(nextNum).padStart(4, '0')}`;

    const [result] = await pool.execute(
      `INSERT INTO Tenants (tenantNumber, firstName, lastName, email, contact, type, department, roomId, guardianName, guardianContact, remarks, amount, duration, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [tenantNumber, firstName, lastName, email, contact, type, department || null, roomId, guardianName || null, guardianContact || null, remarks || null, parsedAmount, duration]
    );

    // Update room status
    await updateRoomStatus(roomId);

    await logActivity({
      category: 'tenant',
      entityType: 'tenant',
      entityId: result.insertId,
      actionType: 'tenant_occupied_room',
      title: `${firstName} ${lastName} occupied Room ${roomId}`,
      details: `Tenant ${tenantNumber} was assigned to room ${roomId} upon creation.`,
      tenantId: result.insertId,
      roomId: Number(roomId),
      performedBy: req.user.id,
    });

    // Auto-create initial payment if provided
    if (payment && payment.amount) {
      try {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const lastDay = new Date(year, month, 0).getDate();
        const dueDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
        const [payResult] = await pool.execute(
          `INSERT INTO Payments (tenantId, amount, dueDate, semester, description, paymentMethod, recordedBy, createdAt, updatedAt) VALUES (?, ?, ?, '', ?, 'cash', ?, NOW(), NOW())`,
          [result.insertId, parseFloat(payment.amount), dueDate, payment.description || 'Monthly Dormitory Fee', req.user.id]
        );
        const receiptNumber = `RCP-${Date.now()}-${payResult.insertId}`;
        await pool.execute("UPDATE Payments SET receiptNumber = ? WHERE id = ?", [receiptNumber, payResult.insertId]);
      } catch (payErr) {
        console.error('Payment auto-create failed (tenant still created):', payErr.message);
      }
    }

    const [newTenant] = await pool.execute(
      `SELECT t.*, r.roomNumber, r.floor as roomFloor
       FROM Tenants t LEFT JOIN Rooms r ON t.roomId = r.id WHERE t.id = ?`,
      [result.insertId]
    );
    const tenant = newTenant[0];
    tenant.room = tenant.roomNumber ? { id: tenant.roomId, roomNumber: tenant.roomNumber, floor: tenant.roomFloor } : null;
    res.status(201).json(tenant);
  } catch (error) {
    console.error("Create tenant error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Update Tenant ---------------- //
router.put("/:id", async (req, res) => {
  try {
    const [existing] = await pool.execute("SELECT * FROM Tenants WHERE id = ?", [req.params.id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    const tenant = existing[0];
    const { firstName, lastName, email, contact, type, department, roomId, guardianName, guardianContact, status, remarks, amount, duration } = req.body;

    if (amount !== undefined && amount !== null && amount !== '') {
      const parsedAmount = parseFloat(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ message: 'Amount must be a valid number greater than 0' });
      }
    }

    if (duration !== undefined && duration !== '' && !['1 sem', '2 sem'].includes(duration)) {
      return res.status(400).json({ message: 'Duration must be either 1 sem or 2 sem' });
    }

    const oldRoomId = tenant.roomId;
    const newRoomId = roomId !== undefined ? (roomId || null) : tenant.roomId;

    // If changing room, verify new room has space
    if (newRoomId && newRoomId !== oldRoomId) {
      const [roomRows] = await pool.execute("SELECT id, capacity FROM Rooms WHERE id = ?", [newRoomId]);
      if (!roomRows.length) {
        return res.status(400).json({ message: 'Selected room does not exist' });
      }
      const [occupantCount] = await pool.execute("SELECT COUNT(*) as count FROM Tenants WHERE roomId = ? AND status = 'active'", [newRoomId]);
      if (occupantCount[0].count >= roomRows[0].capacity) {
        return res.status(400).json({ message: 'Selected room is already full' });
      }
    }

    await pool.execute(
      `UPDATE Tenants SET
        firstName = ?, lastName = ?, email = ?, contact = ?, type = ?,
        department = ?, roomId = ?, guardianName = ?, guardianContact = ?,
        status = ?, remarks = ?, amount = ?, duration = ?, updatedAt = NOW()
       WHERE id = ?`,
      [
        firstName ?? tenant.firstName,
        lastName ?? tenant.lastName,
        email ?? tenant.email,
        contact ?? tenant.contact,
        type ?? tenant.type,
        department !== undefined ? (department || null) : tenant.department,
        newRoomId,
        guardianName !== undefined ? (guardianName || null) : tenant.guardianName,
        guardianContact !== undefined ? (guardianContact || null) : tenant.guardianContact,
        status ?? tenant.status,
        remarks !== undefined ? (remarks || null) : tenant.remarks,
        amount !== undefined && amount !== '' ? parseFloat(amount) : tenant.amount,
        duration !== undefined && duration !== '' ? duration : tenant.duration,
        req.params.id,
      ]
    );

    // Update room statuses if room changed
    if (oldRoomId !== newRoomId) {
      await updateRoomStatus(oldRoomId);
      await updateRoomStatus(newRoomId);
    }

    const [updated] = await pool.execute(
      `SELECT t.*, r.roomNumber, r.floor as roomFloor
       FROM Tenants t LEFT JOIN Rooms r ON t.roomId = r.id WHERE t.id = ?`,
      [req.params.id]
    );
    const result = updated[0];
    result.room = result.roomNumber ? { id: result.roomId, roomNumber: result.roomNumber, floor: result.roomFloor } : null;
    res.json(result);
  } catch (error) {
    console.error("Update tenant error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Archive Tenant ---------------- //
const handleTenantLeave = async ({ req, res, action, remarksValue, actionType, actionLabel }) => {
  const [existing] = await pool.execute("SELECT * FROM Tenants WHERE id = ?", [req.params.id]);
  if (!existing || existing.length === 0) {
    return res.status(404).json({ message: 'Tenant not found' });
  }

  const tenant = existing[0];
  const oldRoomId = tenant.roomId;
  let oldRoomNumber = null;
  if (oldRoomId) {
    const [roomRows] = await pool.execute("SELECT roomNumber FROM Rooms WHERE id = ?", [oldRoomId]);
    if (roomRows.length > 0) {
      oldRoomNumber = roomRows[0].roomNumber;
    }
  }
  const leaveRoomNumber = remarksValue ? oldRoomNumber : null;

  await pool.execute(
    "UPDATE Tenants SET status = 'archived', remarks = ?, lastRoomNumber = ?, roomId = NULL, updatedAt = NOW() WHERE id = ?",
    [remarksValue, leaveRoomNumber, req.params.id]
  );

  await logActivity({
    category: 'archive',
    entityType: 'tenant',
    entityId: tenant.id,
    actionType,
    title: `${tenant.firstName} ${tenant.lastName} was ${actionLabel}`,
    details: oldRoomId ? `Tenant left room ${oldRoomId} due to ${action}.` : `Tenant was marked as ${action} without an active room assignment.`,
    tenantId: tenant.id,
    roomId: oldRoomId || null,
    performedBy: req.user.id,
  });

  if (oldRoomId) {
    const [occupantCount] = await pool.execute(
      "SELECT COUNT(*) as count FROM Tenants WHERE roomId = ? AND status = 'active'",
      [oldRoomId]
    );
    const [roomInfo] = await pool.execute("SELECT capacity FROM Rooms WHERE id = ?", [oldRoomId]);
    if (roomInfo.length > 0) {
      const newStatus = occupantCount[0].count === 0 ? 'available' :
                        occupantCount[0].count >= roomInfo[0].capacity ? 'full' : 'available';
      await pool.execute("UPDATE Rooms SET status = ?, updatedAt = NOW() WHERE id = ?", [newStatus, oldRoomId]);
    }
  }

  res.json({ message: `Tenant ${action} successfully` });
};

router.put("/:id/archive", async (req, res) => {
  try {
    await handleTenantLeave({
      req,
      res,
      action: 'archive',
      remarksValue: null,
      actionType: 'tenant_archived',
      actionLabel: 'archived',
    });
  } catch (error) {
    console.error("Archive tenant error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Drop Tenant ---------------- //
router.put("/:id/drop", async (req, res) => {
  try {
    await handleTenantLeave({
      req,
      res,
      action: 'drop',
      remarksValue: 'drop',
      actionType: 'tenant_dropped',
      actionLabel: 'dropped',
    });
  } catch (error) {
    console.error("Drop tenant error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Graduate Tenant ---------------- //
router.put("/:id/graduated", async (req, res) => {
  try {
    await handleTenantLeave({
      req,
      res,
      action: 'graduation',
      remarksValue: 'graduated',
      actionType: 'tenant_graduated',
      actionLabel: 'marked as graduated',
    });
  } catch (error) {
    console.error("Graduated tenant error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Unarchive Tenant ---------------- //
router.put("/:id/unarchive", async (req, res) => {
  try {
    const { roomId } = req.body;
    const [existing] = await pool.execute("SELECT * FROM Tenants WHERE id = ?", [req.params.id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    if (!roomId) {
      return res.status(400).json({ message: 'A room is required to unarchive this tenant' });
    }

    const [roomRows] = await pool.execute("SELECT id, capacity, status FROM Rooms WHERE id = ?", [roomId]);
    if (!roomRows.length) {
      return res.status(400).json({ message: 'Selected room does not exist' });
    }

    if (roomRows[0].status === 'maintenance') {
      return res.status(400).json({ message: 'Selected room is archived and cannot accept tenants' });
    }

    const [occupantCount] = await pool.execute(
      "SELECT COUNT(*) as count FROM Tenants WHERE roomId = ? AND status = 'active'",
      [roomId]
    );
    if (occupantCount[0].count >= roomRows[0].capacity) {
      return res.status(400).json({ message: 'Selected room is already full' });
    }

    await pool.execute(
      "UPDATE Tenants SET status = 'active', remarks = NULL, lastRoomNumber = NULL, roomId = ?, updatedAt = NOW() WHERE id = ?",
      [roomId, req.params.id]
    );

    await updateRoomStatus(roomId);

    const tenant = existing[0];
    await logActivity({
      category: 'unarchive',
      entityType: 'tenant',
      entityId: tenant.id,
      actionType: 'tenant_unarchived',
      title: `${tenant.firstName} ${tenant.lastName} was unarchived`,
      details: `Tenant returned to room ${roomId}.`,
      tenantId: tenant.id,
      roomId: Number(roomId),
      performedBy: req.user.id,
    });

    res.json({ message: 'Tenant unarchived successfully' });
  } catch (error) {
    console.error("Unarchive tenant error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Delete Tenant ---------------- //
router.delete("/:id", async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM Tenants WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Tenant not found' });

    const tenant = rows[0];

    // Delete associated payments and payment records
    await pool.execute("DELETE FROM Payments WHERE tenantId = ?", [req.params.id]);
    await pool.execute("DELETE FROM PaymentRecords WHERE tenantId = ?", [req.params.id]);

    // Delete tenant
    await pool.execute("DELETE FROM Tenants WHERE id = ?", [req.params.id]);

    // Free up the room if assigned
    if (tenant.roomId) {
      const [occupantCount] = await pool.execute(
        "SELECT COUNT(*) as count FROM Tenants WHERE roomId = ? AND status = 'active'",
        [tenant.roomId]
      );
      const [roomInfo] = await pool.execute("SELECT capacity FROM Rooms WHERE id = ?", [tenant.roomId]);
      if (roomInfo.length > 0) {
        const newStatus = occupantCount[0].count === 0 ? 'available' :
                          occupantCount[0].count >= roomInfo[0].capacity ? 'full' : 'available';
        await pool.execute("UPDATE Rooms SET status = ?, updatedAt = NOW() WHERE id = ?", [newStatus, tenant.roomId]);
      }
    }

    res.json({ message: 'Tenant deleted successfully' });
  } catch (error) {
    console.error("Delete tenant error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
