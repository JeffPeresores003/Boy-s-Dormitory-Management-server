// Server/config/config.js
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const requiredDbVars = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
const missingDbVars = requiredDbVars.filter((name) => !process.env[name]);

if (missingDbVars.length > 0) {
  console.error(`Missing required database environment variables: ${missingDbVars.join(', ')}`);
  process.exit(1);
}

// Create MySQL connection pool
const realPool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 30000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Debug log to confirm pool is loading
console.log("MySQL2 pool created successfully");

// Test the connection on startup
realPool.getConnection()
  .then(connection => {
    console.log('Database connected successfully');
    connection.release();
  })
  .catch(err => {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  });

module.exports = realPool;
