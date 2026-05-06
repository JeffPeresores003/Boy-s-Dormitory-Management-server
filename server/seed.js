require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./config/config');

const seed = async () => {
  try {
    const requiredSeedVars = ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'CASHIER_EMAIL', 'CASHIER_PASSWORD'];
    const missingSeedVars = requiredSeedVars.filter((name) => !process.env[name]);

    if (missingSeedVars.length > 0) {
      console.error(`Missing required seed environment variables: ${missingSeedVars.join(', ')}`);
      process.exit(1);
    }

    // Create Admin Account
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    const [existingAdmin] = await pool.execute("SELECT id FROM Users WHERE email = ?", [adminEmail]);
    if (existingAdmin.length > 0) {
      console.log('Admin account already exists:', adminEmail);
    } else {
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(adminPassword, salt);
      await pool.execute(
        "INSERT INTO Users (name, email, password, role, createdAt, updatedAt) VALUES (?, ?, ?, 'admin', NOW(), NOW())",
        ['System Administrator', adminEmail, hashedPassword]
      );
      console.log('Admin account created successfully');
      console.log(`  Email: ${adminEmail}`);
      console.log(`  Password: ${adminPassword}`);
    }

    // Create Cashier Account
    const cashierEmail = process.env.CASHIER_EMAIL;
    const cashierPassword = process.env.CASHIER_PASSWORD;

    const [existingCashier] = await pool.execute("SELECT id FROM Users WHERE email = ?", [cashierEmail]);
    if (existingCashier.length > 0) {
      console.log('Cashier account already exists:', cashierEmail);
    } else {
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(cashierPassword, salt);
      await pool.execute(
        "INSERT INTO Users (name, email, password, role, createdAt, updatedAt) VALUES (?, ?, ?, 'cashier', NOW(), NOW())",
        ['System Cashier', cashierEmail, hashedPassword]
      );
      console.log('Cashier account created successfully');
      console.log(`  Email: ${cashierEmail}`);
      console.log(`  Password: ${cashierPassword}`);
    }

    console.log('Seed completed');
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error.message);
    process.exit(1);
  }
};

seed();
