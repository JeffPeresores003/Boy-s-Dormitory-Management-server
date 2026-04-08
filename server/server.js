require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const pool = require('./config/config');
const { ensureActivityTable } = require('./utils/activityLogger');
const { ensureTenantRemarksColumn } = require('./utils/tenantSchema');

const app = express();
const uploadsDir = path.join(__dirname, 'uploads');

const requiredServerVars = ['JWT_SECRET'];
const missingServerVars = requiredServerVars.filter((name) => !process.env[name]);

if (missingServerVars.length > 0) {
  console.error(`Missing required server environment variables: ${missingServerVars.join(', ')}`);
  process.exit(1);
}

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const corsOrigins = (process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Middleware
app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files (uploads)
app.use('/uploads', express.static(uploadsDir));

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/tenants', require('./routes/tenants.routes'));
app.use('/api/rooms', require('./routes/rooms.routes'));
app.use('/api/payments', require('./routes/payments.routes'));
app.use('/api/visitors', require('./routes/visitors.routes'));
app.use('/api/dashboard', require('./routes/dashboard.routes'));
app.use('/api/history', require('./routes/history.routes'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'BISU Dormitory API is running' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong', error: err.message });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  ensureActivityTable().catch((error) => {
    console.error('ActivityLogs table initialization failed:', error.message);
  });
  ensureTenantRemarksColumn().catch((error) => {
    console.error('Tenants remarks column initialization failed:', error.message);
  });
});
