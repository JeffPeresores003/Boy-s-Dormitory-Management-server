const pool = require('../config/config');

const ensureTenantRemarksColumn = async () => {
  const [columns] = await pool.execute("SHOW COLUMNS FROM Tenants LIKE 'remarks'");
  if (!columns || columns.length === 0) {
    await pool.execute(
      "ALTER TABLE Tenants ADD COLUMN remarks ENUM('drop','graduated') NULL DEFAULT NULL AFTER status"
    );
  }

  const [lastRoomColumns] = await pool.execute("SHOW COLUMNS FROM Tenants LIKE 'lastRoomNumber'");
  if (!lastRoomColumns || lastRoomColumns.length === 0) {
    await pool.execute(
      "ALTER TABLE Tenants ADD COLUMN lastRoomNumber VARCHAR(50) NULL DEFAULT NULL AFTER remarks"
    );
  }
};

module.exports = { ensureTenantRemarksColumn };
