const express = require('express');
const pool = require('../config/config');
const { protect, authorize } = require('../middleware/authMiddleware');
const { ensureActivityTable } = require('../utils/activityLogger');

const router = express.Router();

router.use(protect);
router.use(authorize('admin'));

router.get('/', async (req, res) => {
  try {
    await ensureActivityTable();

    const { page = 1, limit = 15, search = '', category = '' } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const whereConditions = [];
    const params = [];

    if (category) {
      whereConditions.push('al.category = ?');
      params.push(category);
    }

    if (search) {
      whereConditions.push('(al.title LIKE ? OR al.details LIKE ?)');
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam);
    }

    const whereClause = whereConditions.length ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM ActivityLogs al ${whereClause}`,
      params
    );

    const [rows] = await pool.execute(
      `SELECT al.*, u.name AS userName
       FROM ActivityLogs al
       LEFT JOIN Users u ON al.performedBy = u.id
       ${whereClause}
       ORDER BY al.createdAt DESC
       LIMIT ${parseInt(limit, 10)} OFFSET ${offset}`,
      params
    );

    res.json({
      history: rows,
      total: countRows[0].total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(countRows[0].total / parseInt(limit, 10)),
    });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
