const ldapService = require('../services/ldapService');
const loggerService = require('../services/loggerService');
const connectDB = require('../config/database');

exports.unlockUser = async (req, res) => {
    const { username } = req.params;
    const adminName = req.session?.user?.displayName || 'Sistema';
    try {
        await ldapService.unlockUserByGUID(username);

        // --- LOG DE SUCESSO ---
        await loggerService.logAction(
            'DESBLOQUEIO',
            adminName,
            username,
            'SUCESSO',
            'Conta desbloqueada com sucesso'
        );

        res.json({ success: true, message: 'Conta desbloqueada com sucesso!' });
    } catch (error) {
        console.error(`[ERRO] Falha ao desbloquear ${username}:`, error.message);

        // --- LOG DE ERRO ---
        await loggerService.logAction(
            'DESBLOQUEIO', 
            adminName, 
            username, 
            'ERRO', 
            error.message
        );

        if (error.message.includes('não encontrado')) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }
        return res.status(500).json({ error: 'Falha ao processar desbloqueio no AD.' });
    }
};

exports.disableUser = async (req, res) => {
    const { username } = req.params;
    const adminName = req.session?.user?.displayName || 'Sistema';

    try {
        const result = await ldapService.disableUserFullProcess(username);
        
        try {
            const pool = await connectDB();
            
            // --- APAGA REGISTRO DO BANCO---
            await pool.execute(
                'DELETE FROM users_ad WHERE username = ? LIMIT 1', 
                [username]
            );
            
        } catch (dbErr) {
            console.error("⚠️ Erro ao limpar banco local:", dbErr.message);
        }

        // --- LOG DE SUCESSO ---
        await loggerService.logAction(
            'DESLIGAMENTO', 
            adminName, 
            username, 
            'SUCESSO', 
            result.warning || 'Inativado, Removido dos grupos e movido para a pasta de desativados'
        );

        res.json(result);

    } catch (err) {
        // --- LOG DE ERRO ---
        await loggerService.logAction(
            'DESLIGAMENTO', 
            adminName, 
            username, 
            'ERRO', 
            err.message
        );
        
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.deleteDisabledUser = async (req, res) => {
    const { username } = req.params;
    const adminName = req.session?.user?.displayName || 'Sistema';

    if (!username) {
        return res.status(400).json({ error: 'Username é obrigatório' });
    }

    console.log(`🗑️ Controller: Solicitando exclusão de ${username}...`);

    // 1. Tenta apagar do Active Directory
    try {
        await ldapService.deleteUserByGUID(username);
        const pool = await connectDB();
        await pool.execute('DELETE FROM disabled_users_ad WHERE username = ?', [username]);

        await loggerService.logAction(
            'EXCLUSÃO',   
            adminName,              
            username,               
            'SUCESSO',              
            'Removido do AD e do Histórico'
        );

        res.json({ success: true, message: 'Usuário excluído definitivamente.' });

    } catch (error) {
        console.error('⚠️ Usuário não encontrado: ', error);

        await loggerService.logAction(
            'EXCLUSÃO',
            adminName,
            username,
            'ERRO',
            error.message
        );

        res.status(500).json({ error: 'Erro interno ao excluir usuário.' });
    }
    
};