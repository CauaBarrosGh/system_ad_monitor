const ldapService = require('../services/ldapService');
const loggerService = require('../services/loggerService');
const connectDB = require('../config/database');
const collector = require('../collector')
exports.unlockUser = async (req, res) => {
    const { username } = req.params;
    const sessionUser = req.session?.user;

    // Trava de segurança: Garante que o usuário tem uma sessão viva com senha
    if (!sessionUser || !sessionUser.password) {
        return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }

    const adminName = sessionUser.displayName;

    try {
        // Passamos as credenciais de quem clicou no botão para o Service
        await ldapService.unlockUserByGUID(username, sessionUser.username, sessionUser.password);

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
        return res.status(500).json({ error: 'Falha ao processar desbloqueio no AD. Verifique suas permissões.' });
    }
};

exports.disableUser = async (req, res) => {
    const { username } = req.params;
    const sessionUser = req.session?.user;

    if (!sessionUser || !sessionUser.password) {
        return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }

    const adminName = sessionUser.displayName;

    try {
        // Passamos as credenciais
        const result = await ldapService.disableUserFullProcess(username, sessionUser.username, sessionUser.password);
        
        try {
            const pool = await connectDB();
            // --- APAGA REGISTRO DO BANCO---
            await pool.execute(
                'DELETE FROM users_ad WHERE username = ? LIMIT 1', 
                [username]
            );
            await collector.runJustDisabledUsers();
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
    const sessionUser = req.session?.user;

    if (!sessionUser || !sessionUser.password) {
        return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }

    const adminName = sessionUser.displayName;

    if (!username) {
        return res.status(400).json({ error: 'Username é obrigatório' });
    }

    console.log(`🗑️ Controller: Solicitando exclusão de ${username} por ${adminName}...`);

    try {
        // Passamos as credenciais
        await ldapService.deleteUserByGUID(username, sessionUser.username, sessionUser.password);
        
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
        console.error('⚠️ Erro ao excluir usuário: ', error);

        await loggerService.logAction(
            'EXCLUSÃO',
            adminName,
            username,
            'ERRO',
            error.message
        );

        res.status(500).json({ error: 'Erro interno ao excluir usuário. Verifique suas permissões.' });
    }
};

exports.createUser = async (req, res) => {
    let adminName = 'Sistema';
    let targetUser = 'Desconhecido';

    try {
        adminName = req.session?.user?.displayName || req.user?.displayName || req.user?.username || 'Sistema';
        
        const userData = req.body;
        targetUser = userData.logonName || 'Desconhecido';

        console.log(`\n[CONTROLLER] Requisição para criar usuário: ${targetUser} (Por: ${adminName})`);

        const userExists = await ldapService.checkUserExists(userData.logonName);
        if (userExists) {
            console.log(`⚠️ [CONTROLLER] Criação negada. Logon '${userData.logonName}' já está em uso.`);
            return res.status(400).json({ 
                success: false, 
                error: `O logon "${userData.logonName}" já está registrado no Active Directory.` 
            });
        }

        const targetOU = userData.targetOU;
        
        let finalGroups = [
            'CN=SocTodos,OU=Grupos de Segurança,OU=SOC,DC=soc,DC=com,DC=br'
        ];

        if (userData.targetGroups && Array.isArray(userData.targetGroups)) {
            finalGroups = finalGroups.concat(userData.targetGroups);
        }

        finalGroups = [...new Set(finalGroups)];

        // Executa a criação no Service
        await ldapService.createNewUserFullProcess(userData, targetOU, finalGroups);
        
        // 3. REGISTRA O SUCESSO
        try {
            await loggerService.logAction(
                'CADASTRO USUÁRIO',
                adminName,
                targetUser,
                'SUCESSO',
                'Cadastrado novo usuário'
            );
        } catch (logErr) {
            console.error('⚠️ [AVISO] Falha ao registrar log de auditoria (Sucesso):', logErr);
        }

        res.status(201).json({ success: true, message: 'Usuário provisionado com sucesso no AD!' });

    } catch (error) {
        console.error('[CONTROLLER ERRO]', error);
        
        try {
             await loggerService.logAction(
                'CADASTRO USUÁRIO',
                adminName,
                targetUser,
                'ERRO',
                error.message
            );
        } catch (logErr) {
            console.error('⚠️ [AVISO] Falha ao registrar log de auditoria (Erro):', logErr);
        }
        res.status(500).json({ success: false, error: error.message });
    }
};