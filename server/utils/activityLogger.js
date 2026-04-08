const pool = require('../config/config');

let ensureTablePromise = null;

const ensureActivityTable = async () => {
  if (!ensureTablePromise) {
    ensureTablePromise = pool.execute(`
      CREATE TABLE IF NOT EXISTS ActivityLogs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category VARCHAR(32) NOT NULL,
        entityType VARCHAR(32) NOT NULL,
        entityId INT NULL,
        actionType VARCHAR(64) NOT NULL,
        title VARCHAR(255) NOT NULL,
        details TEXT NULL,
        tenantId INT NULL,
        roomId INT NULL,
        paymentId INT NULL,
        performedBy INT NULL,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_activity_category_created (category, createdAt),
        INDEX idx_activity_entity (entityType, entityId),
        INDEX idx_activity_tenant (tenantId),
        INDEX idx_activity_room (roomId),
        INDEX idx_activity_payment (paymentId),
        INDEX idx_activity_created (createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).catch((error) => {
      ensureTablePromise = null;
      throw error;
    });
  }

  await ensureTablePromise;
};

const logActivity = async ({
  category,
  entityType,
  entityId = null,
  actionType,
  title,
  details = null,
  tenantId = null,
  roomId = null,
  paymentId = null,
  performedBy = null,
}) => {
  await ensureActivityTable();

  await pool.execute(
    `INSERT INTO ActivityLogs
      (category, entityType, entityId, actionType, title, details, tenantId, roomId, paymentId, performedBy, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      category,
      entityType,
      entityId,
      actionType,
      title,
      details,
      tenantId,
      roomId,
      paymentId,
      performedBy,
    ]
  );
};

module.exports = {
  ensureActivityTable,
  logActivity,
};
