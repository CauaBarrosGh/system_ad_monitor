const connectDB = require('../config/database');

exports.getDisabledUsers = async (req, res) => {
  try {
    const pool = await connectDB();

    const [rows] = await pool.execute(`
      SELECT username, display_name, description, department, when_changed, created_at
      FROM disabled_users_ad
      ORDER BY COALESCE(when_changed, created_at) DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error('❌ Erro ao buscar disabled_users_ad:', err.message);
    res.status(500).json({ error: 'Falha ao buscar usuários desativados.' });
  }
};