// Server/routes/rooms.routes.js
const express = require('express');
const pool = require('../config/config');
const { protect, authorize } = require('../middleware/authMiddleware');
const { logActivity } = require('../utils/activityLogger');
const router = express.Router();

// All routes require admin authentication
router.use(protect);
router.use(authorize('admin'));

// Helper: update room status based on occupancy
const updateRoomStatus = async (roomId) => {
  const [roomRows] = await pool.execute("SELECT capacity, status FROM Rooms WHERE id = ?", [roomId]);
  if (!roomRows.length) return;
  const room = roomRows[0];
  if (room.status === 'maintenance') return; // don't change maintenance rooms

  const [countRows] = await pool.execute(
    "SELECT COUNT(*) as count FROM Tenants WHERE roomId = ? AND status = 'active'",
    [roomId]
  );
  const count = countRows[0].count;
  const newStatus = count >= room.capacity ? 'full' : 'available';
  await pool.execute("UPDATE Rooms SET status = ?, updatedAt = NOW() WHERE id = ?", [newStatus, roomId]);
};

// ---------------- Get All Rooms ---------------- //
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status = '', floor = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];

    if (search) {
      whereConditions.push("r.roomNumber LIKE ?");
      params.push(`%${search}%`);
    }
    if (status) {
      whereConditions.push("r.status = ?");
      params.push(status);
    }
    if (floor) {
      whereConditions.push("r.floor = ?");
      params.push(parseInt(floor));
    }

    const whereClause = whereConditions.length > 0 ? "WHERE " + whereConditions.join(" AND ") : "";

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as total FROM Rooms r ${whereClause}`, params
    );
    const total = countRows[0].total;

    const [rooms] = await pool.execute(
      `SELECT r.* FROM Rooms r ${whereClause} ORDER BY r.roomNumber ASC LIMIT ${parseInt(limit)} OFFSET ${offset}`, params
    );

    // Get occupants for each room with availability info
    const roomsWithOccupants = await Promise.all(rooms.map(async (room) => {
      const [occupants] = await pool.execute(
        "SELECT id, firstName, lastName, type, tenantNumber FROM Tenants WHERE roomId = ? AND status = 'active'",
        [room.id]
      );
      const availableSpaces = room.capacity - occupants.length;
      return {
        ...room,
        occupants,
        occupancyCount: occupants.length,
        availableSpaces,
        availabilityMessage: room.status === 'maintenance' ? 'Under Maintenance' :
          availableSpaces <= 0 ? 'Room Full' :
          `${availableSpaces} available bed${availableSpaces > 1 ? 's' : ''}`,
      };
    }));

    res.json({
      rooms: roomsWithOccupants,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error("Get rooms error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Get Single Room ---------------- //
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM Rooms WHERE id = ?", [req.params.id]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const room = rows[0];
    const [occupants] = await pool.execute(
      "SELECT * FROM Tenants WHERE roomId = ? AND status = 'active'", [room.id]
    );
    const availableSpaces = room.capacity - occupants.length;

    res.json({
      ...room,
      occupants,
      occupancyCount: occupants.length,
      availableSpaces,
      availabilityMessage: room.status === 'maintenance' ? 'Under Maintenance' :
        availableSpaces <= 0 ? 'Room Full' :
        `${availableSpaces} available bed${availableSpaces > 1 ? 's' : ''}`,
    });
  } catch (error) {
    console.error("Get room error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Create Room ---------------- //
router.post("/", async (req, res) => {
  try {
    const { roomNumber, floor, capacity, description } = req.body;

    if (!roomNumber || !floor || !capacity) {
      return res.status(400).json({ message: 'Room number, floor, and capacity are required' });
    }

    const [existing] = await pool.execute("SELECT id FROM Rooms WHERE roomNumber = ?", [roomNumber]);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Room number already exists' });
    }

    const [result] = await pool.execute(
      "INSERT INTO Rooms (roomNumber, floor, capacity, description, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'available', NOW(), NOW())",
      [roomNumber, parseInt(floor), parseInt(capacity), description || '']
    );

    const [newRoom] = await pool.execute("SELECT * FROM Rooms WHERE id = ?", [result.insertId]);
    res.status(201).json(newRoom[0]);
  } catch (error) {
    console.error("Create room error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Update Room ---------------- //
router.put("/:id", async (req, res) => {
  try {
    const [existing] = await pool.execute("SELECT * FROM Rooms WHERE id = ?", [req.params.id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const room = existing[0];
    const { roomNumber, floor, capacity, status, description } = req.body;

    // Check if trying to archive a room with active tenants
    if ((status ?? room.status) === 'maintenance' && room.status !== 'maintenance') {
      const [occupants] = await pool.execute(
        "SELECT COUNT(*) as count FROM Tenants WHERE roomId = ? AND status = 'active'",
        [req.params.id]
      );
      if (occupants[0].count > 0) {
        return res.status(400).json({ 
          message: `Cannot archive room with ${occupants[0].count} active tenant${occupants[0].count > 1 ? 's' : ''}. Please unassign all tenants first.` 
        });
      }
    }

    await pool.execute(
      `UPDATE Rooms SET roomNumber = ?, floor = ?, capacity = ?, status = ?, description = ?, updatedAt = NOW() WHERE id = ?`,
      [
        roomNumber ?? room.roomNumber,
        floor ?? room.floor,
        capacity ?? room.capacity,
        status ?? room.status,
        description !== undefined ? description : room.description,
        req.params.id,
      ]
    );

    if ((status ?? room.status) === 'maintenance' && room.status !== 'maintenance') {
      await logActivity({
        category: 'archive',
        entityType: 'room',
        entityId: room.id,
        actionType: 'room_archived',
        title: `Room ${room.roomNumber} was archived`,
        details: 'Room status was changed to archived.',
        roomId: room.id,
        performedBy: req.user.id,
      });
    }

    const [updated] = await pool.execute("SELECT * FROM Rooms WHERE id = ?", [req.params.id]);
    res.json(updated[0]);
  } catch (error) {
    console.error("Update room error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Unarchive Room ---------------- //
router.put("/:id/unarchive", async (req, res) => {
  try {
    const [existing] = await pool.execute("SELECT * FROM Rooms WHERE id = ?", [req.params.id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const room = existing[0];
    const [occupants] = await pool.execute(
      "SELECT COUNT(*) as count FROM Tenants WHERE roomId = ? AND status = 'active'",
      [req.params.id]
    );
    const newStatus = occupants[0].count >= room.capacity ? 'full' : 'available';

    await pool.execute(
      "UPDATE Rooms SET status = ?, updatedAt = NOW() WHERE id = ?",
      [newStatus, req.params.id]
    );

    await logActivity({
      category: 'archive',
      entityType: 'room',
      entityId: room.id,
      actionType: 'room_unarchived',
      title: `Room ${room.roomNumber} was unarchived`,
      details: `Room status restored to ${newStatus}.`,
      roomId: room.id,
      performedBy: req.user.id,
    });

    res.json({ message: 'Room unarchived successfully', status: newStatus });
  } catch (error) {
    console.error("Unarchive room error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Delete Room ---------------- //
router.delete("/:id", async (req, res) => {
  try {
    const [existing] = await pool.execute("SELECT * FROM Rooms WHERE id = ?", [req.params.id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const [occupants] = await pool.execute(
      "SELECT COUNT(*) as count FROM Tenants WHERE roomId = ? AND status = 'active'", [req.params.id]
    );
    if (occupants[0].count > 0) {
      return res.status(400).json({ message: 'Cannot delete room with active tenants' });
    }

    await pool.execute("DELETE FROM Rooms WHERE id = ?", [req.params.id]);
    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    console.error("Delete room error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Assign Tenant to Room ---------------- //
router.post("/:id/assign", async (req, res) => {
  try {
    const { tenantId } = req.body;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }

    const [roomRows] = await pool.execute("SELECT * FROM Rooms WHERE id = ?", [req.params.id]);
    if (!roomRows || roomRows.length === 0) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const room = roomRows[0];
    if (room.status === 'maintenance') {
      return res.status(400).json({ message: 'Room is under maintenance' });
    }

    const [occupantCount] = await pool.execute(
      "SELECT COUNT(*) as count FROM Tenants WHERE roomId = ? AND status = 'active'", [room.id]
    );
    if (occupantCount[0].count >= room.capacity) {
      return res.status(400).json({ message: 'Room is at full capacity' });
    }

    const [tenantRows] = await pool.execute("SELECT * FROM Tenants WHERE id = ?", [tenantId]);
    if (!tenantRows || tenantRows.length === 0) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    const tenant = tenantRows[0];
    const oldRoomId = tenant.roomId;

    // Assign tenant to new room
    await pool.execute("UPDATE Tenants SET roomId = ?, updatedAt = NOW() WHERE id = ?", [room.id, tenantId]);

    // Update new room status
    await updateRoomStatus(room.id);

    // Update old room status
    if (oldRoomId) {
      await updateRoomStatus(oldRoomId);
    }

    await logActivity({
      category: 'tenant',
      entityType: 'tenant',
      entityId: tenant.id,
      actionType: 'tenant_occupied_room',
      title: `${tenant.firstName} ${tenant.lastName} occupied Room ${room.roomNumber}`,
      details: oldRoomId
        ? `Tenant transferred from room ${oldRoomId} to room ${room.id}.`
        : `Tenant was assigned to room ${room.id}.`,
      tenantId: tenant.id,
      roomId: room.id,
      performedBy: req.user.id,
    });

    res.json({ message: 'Tenant assigned to room successfully' });
  } catch (error) {
    console.error("Assign tenant error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Remove Tenant from Room ---------------- //
router.post("/:id/remove", async (req, res) => {
  try {
    const { tenantId } = req.body;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }

    const [tenantRows] = await pool.execute("SELECT * FROM Tenants WHERE id = ?", [tenantId]);
    if (!tenantRows || tenantRows.length === 0 || tenantRows[0].roomId !== parseInt(req.params.id)) {
      return res.status(404).json({ message: 'Tenant not found in this room' });
    }

    await pool.execute("UPDATE Tenants SET roomId = NULL, updatedAt = NOW() WHERE id = ?", [tenantId]);

    // Update room status
    await updateRoomStatus(parseInt(req.params.id));

    res.json({ message: 'Tenant removed from room successfully' });
  } catch (error) {
    console.error("Remove tenant error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
