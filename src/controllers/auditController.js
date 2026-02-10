const loggerService = require('../services/loggerService');

exports.getAuditLogs = async (req, res) => {
    try {
        const logs = await loggerService.getLogs();
        res.json(logs);
    } catch (error) {
        console.error('Erro no controller de auditoria:', error);
        res.status(500).json({ error: 'Erro ao buscar logs de auditoria' });
    }
};