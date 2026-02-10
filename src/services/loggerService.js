const connectDB = require('../config/database');

exports.logAction = async (action, executor, target, status, details = '') => {
    try {
        const pool = await connectDB();
        const query = `
            INSERT INTO audit_logs (action, executor, target, status, details, timestamp)
            VALUES (?, ?, ?, ?, ?, NOW())
        `;
        
        await pool.execute(query, [action, executor, target, status, details]);
        
    } catch (err) {
        console.error("❌ Erro ao salvar log no MySQL:", err.message);
    }
};

exports.getLogs = async () => {
    try {
        const pool = await connectDB();
        const query = `SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100`;
        const [rows] = await pool.execute(query);
        
        return rows;
    } catch (err) {
        console.error("❌ Erro ao ler logs:", err.message);
        return [];
    }
};