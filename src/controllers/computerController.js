const ldapService = require('../services/ldapService');
const logger = require('../services/loggerService');
const connectDB = require('../config/database');

exports.deleteComputer = async (req, res) => {

    const { computerName } = req.params;
    const executor = req.session?.user?.displayName || 'Admin';

    if (!computerName) {
        return res.status(400).json({ error: 'Nome do computador é obrigatório' });
    }

    try {
        console.log(`🗑️ [CONTROLLER] Excluindo máquina: ${computerName}`);

        // 1. Deleta do AD
        const result = await ldapService.deleteComputer(computerName);

        // 2. Apaga do Banco
        const pool = await connectDB();
        await pool.execute('DELETE FROM computers_ad WHERE hostname = ?', [computerName]);
        console.log('✅ Removido do banco de dados com sucesso.');

        // 3. Log de Auditoria
        await logger.logAction(
            'EXCLUSÃO COMPUTADOR',
            executor,
            computerName,
            'SUCESSO',
            result.found ? 'Computador removido do AD' : 'Computador não existia no AD'
        );

        res.json({ success: true, message: 'Computador excluído com sucesso.' });

    } catch (error) {
        console.error('❌ Erro ao excluir computador:', error);

        await logger.logAction(
            'EXCLUSÃO COMPUTADOR',
            executor,
            computerName,
            'ERRO',
            error.message
        );

        res.status(500).json({ error: 'Erro ao excluir computador.' });
    }
};