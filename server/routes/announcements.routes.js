// Server/routes/announcements.routes.js
const express = require('express');
const pool = require('../config/config');
const { protect, authorize } = require('../middleware/authMiddleware');
const router = express.Router();

// All routes require authentication
router.use(protect);

// ---------------- Get All Announcements ---------------- //
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, category = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = [];
    let params = [];

    if (category) {
      whereConditions.push("a.category = ?");
      params.push(category);
    }

    const whereClause = whereConditions.length > 0 ? "WHERE " + whereConditions.join(" AND ") : "";

    // Get total count
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as total FROM Announcements a ${whereClause}`,
      params
    );
    const total = countRows[0].total;

    // Get paginated announcements with author info
    const [announcements] = await pool.execute(
      `SELECT a.*, u.id as authorId, u.name as authorName
       FROM Announcements a
       LEFT JOIN Users u ON a.postedBy = u.id
       ${whereClause}
       ORDER BY a.createdAt DESC
       LIMIT ${parseInt(limit)} OFFSET ${offset}`,
      params
    );

    // Format with nested author object
    const formattedAnnouncements = announcements.map(a => ({
      id: a.id,
      title: a.title,
      content: a.content,
      category: a.category,
      postedBy: a.postedBy,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      author: a.authorId ? { id: a.authorId, name: a.authorName } : null,
    }));

    res.json({
      announcements: formattedAnnouncements,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error("Get announcements error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Create Announcement (Admin) ---------------- //
router.post("/", authorize('admin'), async (req, res) => {
  try {
    const { title, content, category } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required' });
    }

    const [result] = await pool.execute(
      `INSERT INTO Announcements (title, content, category, postedBy, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [title, content, category || 'general', req.user.id]
    );

    // Return created announcement with author info
    const [newAnnouncement] = await pool.execute(
      `SELECT a.*, u.id as authorId, u.name as authorName
       FROM Announcements a
       LEFT JOIN Users u ON a.postedBy = u.id
       WHERE a.id = ?`,
      [result.insertId]
    );

    const a = newAnnouncement[0];
    res.status(201).json({
      id: a.id,
      title: a.title,
      content: a.content,
      category: a.category,
      postedBy: a.postedBy,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      author: { id: a.authorId, name: a.authorName },
    });
  } catch (error) {
    console.error("Create announcement error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Update Announcement (Admin) ---------------- //
router.put("/:id", authorize('admin'), async (req, res) => {
  try {
    const [existing] = await pool.execute("SELECT * FROM Announcements WHERE id = ?", [req.params.id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    const announcement = existing[0];
    const { title, content, category } = req.body;

    await pool.execute(
      `UPDATE Announcements SET title = ?, content = ?, category = ?, updatedAt = NOW() WHERE id = ?`,
      [
        title ?? announcement.title,
        content ?? announcement.content,
        category ?? announcement.category,
        req.params.id,
      ]
    );

    // Return updated announcement with author info
    const [updated] = await pool.execute(
      `SELECT a.*, u.id as authorId, u.name as authorName
       FROM Announcements a
       LEFT JOIN Users u ON a.postedBy = u.id
       WHERE a.id = ?`,
      [req.params.id]
    );

    const a = updated[0];
    res.json({
      id: a.id,
      title: a.title,
      content: a.content,
      category: a.category,
      postedBy: a.postedBy,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      author: a.authorId ? { id: a.authorId, name: a.authorName } : null,
    });
  } catch (error) {
    console.error("Update announcement error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Delete Announcement (Admin) ---------------- //
router.delete("/:id", authorize('admin'), async (req, res) => {
  try {
    const [existing] = await pool.execute("SELECT id FROM Announcements WHERE id = ?", [req.params.id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    await pool.execute("DELETE FROM Announcements WHERE id = ?", [req.params.id]);
    res.json({ message: 'Announcement deleted successfully' });
  } catch (error) {
    console.error("Delete announcement error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
