const ldapService = require('../services/ldapService');
const logger = require('../services/loggerService');
const connectDB = require('../config/database');

exports.deleteComputer = async (req, res) => {
    const { computerName } = req.params;
    const sessionUser = req.session?.user;

    // 🔒 1. Trava de segurança: Garante que o usuário tem uma sessão viva com senha
    if (!sessionUser || !sessionUser.password) {
        return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }

    const executor = sessionUser.displayName;

    if (!computerName) {
        return res.status(400).json({ error: 'Nome do computador é obrigatório' });
    }

    try {
        console.log(`🗑️ [CONTROLLER] Excluindo máquina: ${computerName} (Solicitado por: ${executor})`);

        // 🔑 2. Passamos as credenciais de quem clicou no botão para o Service
        const result = await ldapService.deleteComputer(computerName, sessionUser.username, sessionUser.password);

        // 3. Apaga do Banco local
        const pool = await connectDB();
        await pool.execute('DELETE FROM computers_ad WHERE hostname = ?', [computerName]);
        console.log('✅ Removido do banco de dados local com sucesso.');

        // 4. Log de Auditoria
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

        res.status(500).json({ error: 'Erro ao excluir computador. Verifique suas permissões no AD.' });
    }
};