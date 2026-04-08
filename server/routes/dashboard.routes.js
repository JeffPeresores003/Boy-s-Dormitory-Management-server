// Server/routes/dashboard.routes.js
const express = require('express');
const pool = require('../config/config');
const { protect, authorize } = require('../middleware/authMiddleware');
const router = express.Router();

// All dashboard routes require admin authentication
router.use(protect);
router.use(authorize('admin'));

// ---------------- Get Dashboard Stats ---------------- //
router.get("/stats", async (req, res) => {
  try {
    const [tenantRowsResult, roomRowsResult, paymentRowsResult, visitorRowsResult] = await Promise.all([
      pool.execute(
        `SELECT
          COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS totalTenants,
          COALESCE(SUM(CASE WHEN status = 'active' AND type = 'student' THEN 1 ELSE 0 END), 0) AS totalStudents,
          COALESCE(SUM(CASE WHEN status = 'active' AND type = 'staff' THEN 1 ELSE 0 END), 0) AS totalStaff,
          COALESCE(SUM(CASE WHEN status = 'active' AND type = 'faculty' THEN 1 ELSE 0 END), 0) AS totalFaculty
         FROM Tenants`
      ),
      pool.execute(
        `SELECT
          COUNT(*) AS totalRooms,
          COALESCE(SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END), 0) AS availableRooms,
          COALESCE(SUM(CASE WHEN status = 'full' THEN 1 ELSE 0 END), 0) AS fullRooms,
          COALESCE(SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END), 0) AS maintenanceRooms,
          COALESCE(SUM(CASE WHEN status != 'maintenance' THEN capacity ELSE 0 END), 0) AS totalCapacity
         FROM Rooms`
      ),
      pool.execute(
        `SELECT
          COALESCE(SUM(CASE WHEN status = 'unpaid' THEN 1 ELSE 0 END), 0) AS pendingPayments,
          COALESCE(SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END), 0) AS partialPayments,
          COALESCE(SUM(amount), 0) AS totalBilled,
          COALESCE(SUM(amountPaid), 0) AS totalCollected,
          COALESCE(SUM(amount - amountPaid), 0) AS totalBalance
         FROM Payments`
      ),
      pool.execute(
        "SELECT COUNT(*) AS todayVisitors FROM Visitors WHERE DATE(timeIn) = CURDATE()"
      ),
    ]);

    const tenantRows = tenantRowsResult[0][0] || {};
    const roomRows = roomRowsResult[0][0] || {};
    const paymentRows = paymentRowsResult[0][0] || {};
    const visitorRows = visitorRowsResult[0][0] || {};

    const activeTenants  = Number(tenantRows.totalTenants || 0);
    const totalCapacity  = Number(roomRows.totalCapacity || 0);
    const totalCollected = Number(paymentRows.totalCollected || 0);
    const totalBilled    = Number(paymentRows.totalBilled || 0);
    const occupancyRate  = totalCapacity > 0 ? Math.round((activeTenants / totalCapacity) * 100) : 0;
    const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;

    res.json({
      totalTenants:     activeTenants,
      totalStudents:    Number(tenantRows.totalStudents || 0),
      totalStaff:       Number(tenantRows.totalStaff || 0),
      totalFaculty:     Number(tenantRows.totalFaculty || 0),
      totalRooms:       Number(roomRows.totalRooms || 0),
      availableRooms:   Number(roomRows.availableRooms || 0),
      fullRooms:        Number(roomRows.fullRooms || 0),
      maintenanceRooms: Number(roomRows.maintenanceRooms || 0),
      pendingPayments:  Number(paymentRows.pendingPayments || 0),
      partialPayments:  Number(paymentRows.partialPayments || 0),
      todayVisitors:    Number(visitorRows.todayVisitors || 0),
      totalBilled,
      totalCollected,
      totalBalance:     Number(paymentRows.totalBalance || 0),
      occupancyRate,
      collectionRate,
      totalCapacity,
    });
  } catch (error) {
    console.error("Get dashboard stats error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Monthly Revenue (last 6 months) ---------------- //
router.get("/analytics/monthly-revenue", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
        DATE_FORMAT(paymentDate, '%b %Y') as label,
        YEAR(paymentDate) as yr,
        MONTH(paymentDate) as mo,
        COALESCE(SUM(amountPaid), 0) as revenue
       FROM Payments
       WHERE paymentDate IS NOT NULL
         AND paymentDate >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY yr, mo, label
       ORDER BY yr ASC, mo ASC`
    );
    res.json(rows);
  } catch (error) {
    console.error("Monthly revenue error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Recent Tenants (last 5) ---------------- //
router.get("/analytics/recent-tenants", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT t.id, t.tenantNumber, t.firstName, t.lastName, t.type, t.status,
              r.roomNumber
       FROM Tenants t
       LEFT JOIN Rooms r ON t.roomId = r.id
       ORDER BY t.createdAt DESC
       LIMIT 5`
    );
    res.json(rows);
  } catch (error) {
    console.error("Recent tenants error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Recent Visitors (last 5) ---------------- //
router.get("/analytics/recent-visitors", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT v.id, v.visitorName, v.purpose, v.timeIn, v.timeOut,
              t.firstName as tenantFirstName, t.lastName as tenantLastName
       FROM Visitors v
       LEFT JOIN Tenants t ON v.tenantVisitedId = t.id
       ORDER BY v.timeIn DESC
       LIMIT 5`
    );
    res.json(rows);
  } catch (error) {
    console.error("Recent visitors error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Get Occupancy Report ---------------- //
router.get("/occupancy-report", async (req, res) => {
  try {
    const [rooms] = await pool.execute(
      "SELECT * FROM Rooms ORDER BY roomNumber ASC"
    );

    const report = await Promise.all(rooms.map(async (room) => {
      const [occupants] = await pool.execute(
        "SELECT id, firstName, lastName, tenantNumber, type FROM Tenants WHERE roomId = ? AND status = 'active'",
        [room.id]
      );

      const available = room.capacity - occupants.length;
      let availabilityMessage = '';
      if (room.status === 'maintenance') {
        availabilityMessage = 'Under Maintenance';
      } else if (available <= 0) {
        availabilityMessage = 'Room Full';
      } else {
        availabilityMessage = `${available} available bed${available > 1 ? 's' : ''}`;
      }

      return {
        roomNumber: room.roomNumber,
        floor: room.floor,
        type: room.type,
        capacity: room.capacity,
        occupants: occupants.length,
        status: room.status,
        availabilityMessage,
        tenants: occupants,
      };
    }));

    res.json(report);
  } catch (error) {
    console.error("Get occupancy report error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Get Payment Report ---------------- //
router.get("/payment-report", async (req, res) => {
  try {
    const { semester = '', status = '' } = req.query;

    let whereConditions = [];
    let params = [];

    if (semester) {
      whereConditions.push("p.semester = ?");
      params.push(semester);
    }
    if (status) {
      whereConditions.push("p.status = ?");
      params.push(status);
    }

    const whereClause = whereConditions.length > 0 ? "WHERE " + whereConditions.join(" AND ") : "";

    const [payments] = await pool.execute(
      `SELECT p.*, t.id as tenantPk, t.firstName, t.lastName, t.tenantNumber
       FROM Payments p
       LEFT JOIN Tenants t ON p.tenantId = t.id
       ${whereClause}
       ORDER BY p.dueDate DESC`,
      params
    );

    const formattedPayments = payments.map(p => ({
      id: p.id,
      tenantId: p.tenantId,
      amount: p.amount,
      dueDate: p.dueDate,
      paymentDate: p.paymentDate,
      status: p.status,
      amountPaid: p.amountPaid,
      semester: p.semester,
      description: p.description,
      receiptNumber: p.receiptNumber,
      createdAt: p.createdAt,
      tenant: p.tenantPk ? {
        id: p.tenantPk,
        firstName: p.firstName,
        lastName: p.lastName,
        tenantNumber: p.tenantNumber,
      } : null,
    }));

    res.json(formattedPayments);
  } catch (error) {
    console.error("Get payment report error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Export Occupancy PDF ---------------- //
router.get("/export/occupancy", async (req, res) => {
  try {
    const PDFDocument = require('pdfkit');

    const [rooms] = await pool.execute("SELECT * FROM Rooms ORDER BY roomNumber ASC");

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=occupancy-report.pdf');
    doc.pipe(res);

    doc.fontSize(18).text("BISU Boy's Dormitory - Occupancy Report", { align: 'center' });
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.moveDown(2);

    for (const room of rooms) {
      const [occupants] = await pool.execute(
        "SELECT firstName, lastName, tenantNumber, type FROM Tenants WHERE roomId = ? AND status = 'active'",
        [room.id]
      );

      const available = room.capacity - occupants.length;
      doc.fontSize(12).text(`Room ${room.roomNumber} (Floor ${room.floor}) - ${room.type} - ${room.status}`, { underline: true });
      doc.fontSize(10).text(`Capacity: ${room.capacity} | Occupants: ${occupants.length} | Available: ${available}`);

      occupants.forEach(t => {
        doc.text(`  • ${t.firstName} ${t.lastName} (${t.tenantNumber}) - ${t.type}`);
      });

      doc.moveDown();
    }

    doc.end();
  } catch (error) {
    console.error("Export occupancy PDF error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Export Payments Excel ---------------- //
router.get("/export/payments", async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { semester = '' } = req.query;

    let query = `SELECT p.*, t.firstName, t.lastName, t.tenantNumber
                 FROM Payments p LEFT JOIN Tenants t ON p.tenantId = t.id`;
    let params = [];

    if (semester) {
      query += " WHERE p.semester = ?";
      params.push(semester);
    }

    query += " ORDER BY p.dueDate DESC";

    const [payments] = await pool.execute(query, params);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Payment Report');

    worksheet.columns = [
      { header: 'Tenant ID', key: 'tenantId', width: 15 },
      { header: 'Tenant Name', key: 'tenantName', width: 25 },
      { header: 'Amount', key: 'amount', width: 12 },
      { header: 'Amount Paid', key: 'amountPaid', width: 12 },
      { header: 'Balance', key: 'balance', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Semester', key: 'semester', width: 15 },
      { header: 'Due Date', key: 'dueDate', width: 12 },
      { header: 'Payment Date', key: 'paymentDate', width: 12 },
      { header: 'Receipt #', key: 'receipt', width: 18 },
    ];

    worksheet.getRow(1).font = { bold: true };

    payments.forEach(p => {
      worksheet.addRow({
        tenantId: p.tenantNumber || '',
        tenantName: p.firstName ? `${p.firstName} ${p.lastName}` : '',
        amount: parseFloat(p.amount),
        amountPaid: parseFloat(p.amountPaid),
        balance: parseFloat(p.amount) - parseFloat(p.amountPaid),
        status: p.status,
        semester: p.semester,
        dueDate: p.dueDate,
        paymentDate: p.paymentDate || '',
        receipt: p.receiptNumber || '',
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=payment-report.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Export payments Excel error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Export Visitors Excel ---------------- //
router.get("/export/visitors", async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { date = '' } = req.query;

    let query = `SELECT v.*, t.firstName as tenantFirstName, t.lastName as tenantLastName
                 FROM Visitors v LEFT JOIN Tenants t ON v.tenantVisitedId = t.id`;
    let params = [];

    if (date) {
      query += " WHERE DATE(v.timeIn) = ?";
      params.push(date);
    }

    query += " ORDER BY v.timeIn DESC";

    const [visitors] = await pool.execute(query, params);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Visitor Log');

    worksheet.columns = [
      { header: 'Visitor Name', key: 'visitorName', width: 25 },
      { header: 'Tenant Visited', key: 'tenantName', width: 25 },
      { header: 'Purpose', key: 'purpose', width: 30 },
      { header: 'Time In', key: 'timeIn', width: 20 },
      { header: 'Time Out', key: 'timeOut', width: 20 },
    ];

    worksheet.getRow(1).font = { bold: true };

    visitors.forEach(v => {
      worksheet.addRow({
        visitorName: v.visitorName,
        tenantName: v.tenantFirstName ? `${v.tenantFirstName} ${v.tenantLastName}` : '',
        purpose: v.purpose,
        timeIn: v.timeIn ? new Date(v.timeIn).toLocaleString() : '',
        timeOut: v.timeOut ? new Date(v.timeOut).toLocaleString() : '',
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=visitor-log.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Export visitors Excel error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ---------------- Generate Report (PDF or Excel) ---------------- //
router.get("/reports/:type", async (req, res) => {
  try {
    const { type } = req.params;
    const { format = 'pdf' } = req.query;

    const reportGenerators = {
      tenants: async () => {
        const [tenants] = await pool.execute(
          `SELECT t.*, r.roomNumber FROM Tenants t LEFT JOIN Rooms r ON t.roomId = r.id WHERE t.status = 'active' ORDER BY t.lastName ASC`
        );
        return {
          title: 'Tenants Report',
          headers: ['ID Number', 'Name', 'Type', 'Department', 'Room', 'Contact', 'Guardian'],
          rows: tenants.map(t => [
            t.tenantNumber, `${t.firstName} ${t.lastName}`, t.type,
            t.department || 'N/A', t.roomNumber || 'N/A', t.contact, t.guardianName,
          ]),
        };
      },
      rooms: async () => {
        const [rooms] = await pool.execute("SELECT * FROM Rooms ORDER BY roomNumber ASC");
        const result = await Promise.all(rooms.map(async (r) => {
          const [count] = await pool.execute(
            "SELECT COUNT(*) as cnt FROM Tenants WHERE roomId = ? AND status = 'active'", [r.id]
          );
          const available = r.capacity - count[0].cnt;
          return [r.roomNumber, r.floor, r.type, r.capacity, count[0].cnt, available, r.status];
        }));
        return {
          title: 'Rooms Report',
          headers: ['Room #', 'Floor', 'Type', 'Capacity', 'Occupants', 'Available', 'Status'],
          rows: result,
        };
      },
      payments: async () => {
        const [payments] = await pool.execute(
          `SELECT p.*, t.firstName, t.lastName, t.tenantNumber FROM Payments p LEFT JOIN Tenants t ON p.tenantId = t.id ORDER BY p.dueDate DESC`
        );
        return {
          title: 'Payments Report',
          headers: ['Tenant ID', 'Name', 'Amount', 'Paid', 'Balance', 'Status', 'Due Date'],
          rows: payments.map(p => [
            p.tenantNumber || '', `${p.firstName || ''} ${p.lastName || ''}`,
            parseFloat(p.amount), parseFloat(p.amountPaid),
            parseFloat(p.amount) - parseFloat(p.amountPaid), p.status,
            p.dueDate ? new Date(p.dueDate).toLocaleDateString() : '',
          ]),
        };
      },
      visitors: async () => {
        const [visitors] = await pool.execute(
          `SELECT v.*, t.firstName as tenantFirstName, t.lastName as tenantLastName FROM Visitors v
           LEFT JOIN Tenants t ON v.tenantVisitedId = t.id ORDER BY v.timeIn DESC`
        );
        return {
          title: 'Visitors Report',
          headers: ['Visitor', 'Tenant Visited', 'Purpose', 'Time In', 'Time Out'],
          rows: visitors.map(v => [
            v.visitorName,
            `${v.tenantFirstName || ''} ${v.tenantLastName || ''}`,
            v.purpose,
            v.timeIn ? new Date(v.timeIn).toLocaleString() : '',
            v.timeOut ? new Date(v.timeOut).toLocaleString() : '',
          ]),
        };
      },
    };

    const generator = reportGenerators[type];
    if (!generator) return res.status(400).json({ message: 'Invalid report type' });

    const data = await generator();

    if (format === 'excel') {
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet(data.title);
      ws.columns = data.headers.map((h, i) => ({ header: h, key: `col${i}`, width: 20 }));
      ws.getRow(1).font = { bold: true };
      data.rows.forEach(row => {
        const obj = {};
        row.forEach((val, i) => { obj[`col${i}`] = val; });
        ws.addRow(obj);
      });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${type}-report.xlsx`);
      await workbook.xlsx.write(res);
      res.end();
    } else {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${type}-report.pdf`);
      doc.pipe(res);
      doc.fontSize(16).text(`BISU Boy's Dormitory - ${data.title}`, { align: 'center' });
      doc.fontSize(9).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.moveDown(2);
      doc.fontSize(9).font('Helvetica-Bold');
      doc.text(data.headers.join('  |  '));
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(8);
      data.rows.forEach(row => {
        doc.text(row.join('  |  '));
      });
      doc.end();
    }
  } catch (error) {
    console.error("Generate report error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
