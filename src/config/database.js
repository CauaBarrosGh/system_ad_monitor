const mysql = require('mysql2/promise');

const DB_CONFIG = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
};

let pool;

async function connectDB() {
    if (!pool) pool = await mysql.createPool(DB_CONFIG);
    return pool;
}

module.exports = connectDB;