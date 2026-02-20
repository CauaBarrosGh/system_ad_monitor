const connectDB = require('../config/database');
const ldapService = require('../services/ldapService');

// Coleta os KPIS do banco
exports.getKPIs = async (req, res) => {
    try {
        const db = await connectDB();
        const [rows] = await db.execute(`SELECT COUNT(*) as total, SUM(CASE WHEN is_enabled=1 THEN 1 ELSE 0 END) as ativos, SUM(CASE WHEN is_enabled=0 THEN 1 ELSE 0 END) as inativos FROM users_ad`);
        res.json(rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

// Coleta os computadores do banco
exports.getComputers = async (req, res) => {
    try {
        const db = await connectDB();
        const [rows] = await db.execute(`SELECT * FROM computers_ad ORDER BY last_logon DESC`);
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
};
// Coleta os usuarios do banco
exports.getAllUsers = async (req, res) => {
    try {
        const db = await connectDB();
        const [rows] = await db.execute(`SELECT * FROM users_ad ORDER BY display_name ASC`);
        res.json(rows.map(u => ({ ...u, risk_factors: u.risk_factors ? JSON.parse(u.risk_factors) : [] })));
    } catch (e) { res.status(500).json({ error: e.message }); }
};
// Coleta os riscos do banco
exports.getSecurityRisks = async (req, res) => {
    try {
        const db = await connectDB();
        const [rows] = await db.execute(`SELECT username, display_name, role, department, risk_score, risk_factors, pwd_last_set, last_logon, is_enabled FROM users_ad WHERE risk_score > 0 ORDER BY risk_score DESC`);
        res.json(rows.map(r => ({ ...r, risk_factors: r.risk_factors ? JSON.parse(r.risk_factors) : [] })));
    } catch (e) { res.status(500).json({ error: e.message }); }
};
// Busca todos os grupos para o seletor do modal
exports.getAllGroups = async (req, res) => {
    try {
        const { username, password } = req.session.user;
        const groups = await ldapService.getAllADGroups(username, password);
        res.json(groups);
    } catch (error) {
        console.error('❌ Erro ao buscar grupos do AD:', error.message);
        res.status(500).json({ error: 'Não foi possível carregar a lista de grupos.' });
    }
};