const ldapService = require('../services/ldapService');
const loggerService = require('../services/loggerService');
const connectDB = require('../config/database');
const collector = require('../collector')

// Desbloquear usuário
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

        // log sucesso
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

        // log erro
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

// Desativar usuário
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
            // apaga do banco
            await pool.execute(
                'DELETE FROM users_ad WHERE username = ? LIMIT 1', 
                [username]
            );
            await collector.runJustDisabledUsers();
        } catch (dbErr) {
            console.error("⚠️ Erro ao limpar banco local:", dbErr.message);
        }

        // log sucesso
        await loggerService.logAction(
            'DESLIGAMENTO', 
            adminName, 
            username, 
            'SUCESSO', 
            result.warning || 'Inativado, Removido dos grupos e movido para a pasta de desativados'
        );

        res.json(result);

    } catch (err) {
        // log erro
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

// Deletar usuário
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
            'EXCLUSÃO USUÁRIO',   
            adminName,              
            username,               
            'SUCESSO',              
            'Removido do AD e do Histórico'
        );

        res.json({ success: true, message: 'Usuário excluído definitivamente.' });

    } catch (error) {
        console.error('⚠️ Erro ao excluir usuário: ', error);

        await loggerService.logAction(
            'EXCLUSÃO USUÁRIO',
            adminName,
            username,
            'ERRO',
            error.message
        );

        res.status(500).json({ error: 'Erro interno ao excluir usuário. Verifique suas permissões.' });
    }
};

// Criar usuário
exports.createUser = async (req, res) => {
    const sessionUser = req.session?.user;
    
    // Validação de Sessão
    if (!sessionUser || !sessionUser.password) {
        return res.status(401).json({ success: false, error: 'Sessão expirada. Faça login novamente.' });
    }

    const adminName = sessionUser.displayName || sessionUser.username;
    const adminUser = sessionUser.username;
    const adminPass = sessionUser.password;

    const userData = req.body;
    const targetUserLogon = userData.logonName || 'Desconhecido';

    console.log(`\n🆕 Controller: Solicitando criação de ${targetUserLogon} por ${adminName}...`);

    try {
        // Verifica se já existe
        const userExists = await ldapService.checkUserExists(userData.logonName, adminUser, adminPass);
        if (userExists) {
            return res.status(400).json({ 
                success: false, 
                error: `O logon "${userData.logonName}" já está registrado no Active Directory.` 
            });
        }

        // Prepara Grupos
        const targetOU = userData.targetOU;
        let finalGroups = ['CN=SocTodos,OU=Grupos de Segurança,OU=SOC,DC=soc,DC=com,DC=br'];
        if (userData.targetGroups && Array.isArray(userData.targetGroups)) {
            finalGroups = finalGroups.concat(userData.targetGroups);
        }
        finalGroups = [...new Set(finalGroups)];

        // CRIA NO AD (LDAP + PowerShell)
        await ldapService.createNewUserFullProcess(userData, targetOU, finalGroups, adminUser, adminPass);
        
        // CHAMA O COLLECTOR 
        try {
            console.log('🔄 Atualizando base local (MySQL) com o novo usuário...');
            
            // Chama a função SEGURA que criamos agora
            if (collector.syncUsers) {
                await collector.syncUsers(); 
            } else {
                console.warn('⚠️ Função collector.syncUsers não encontrada. Verifique o exports do collector.js');
            }

        } catch (syncErr) {
            console.error('⚠️ Aviso: Usuário criado no AD, mas falha ao sincronizar painel:', syncErr.message);
        }

        // Log de Auditoria
        try {
            await loggerService.logAction('CADASTRO USUÁRIO', adminName, targetUserLogon, 'SUCESSO', 'Cadastrado Usuário');
        } catch (logErr) { console.error(logErr); }

        res.status(201).json({ success: true, message: 'Usuário cadastrado com sucesso no AD e painel atualizado!' });

    } catch (error) {
        console.error('❌ Erro ao criar usuário:', error);
        try {
             await loggerService.logAction('CADASTRO USUÁRIO', adminName, targetUserLogon, 'ERRO', error.message);
        } catch (logErr) {}
        
        res.status(500).json({ success: false, error: error.message });
    }
};

// Busca os dados que vão preencher o modal de edição
exports.getUserData = async (req, res) => {
    try {
        const { username } = req.params;
        const sessionUser = req.session?.user;

        if (!sessionUser || !sessionUser.password) {
            return res.status(401).json({ error: 'Sessão expirada.' });
        }
        const details = await ldapService.getUserDetails(username, sessionUser.username, sessionUser.password);

        res.json({ details});
    } catch (error) {
        console.error('Erro ao buscar dados para o modal:', error);
        res.status(500).json({ error: error.message });
    }
};

// Edição do usuário
exports.editUser = async (req, res) => {
    const { username } = req.params;
    const { username: adminU, password: adminP } = req.session.user;
    const sessionUser = req.session?.user;
    const adminName = sessionUser.displayName;

    try {
        await ldapService.updateUserFull(username, req.body, adminU, adminP);
        
        await collector.syncUsers(); 
        try {
            await loggerService.logAction('EDITADO USUÁRIO', adminName, username, 'SUCESSO', 'Editado atributos');
        } catch (logErr) { console.error(logErr); }

        res.json({ success: true, message: 'AD e MySQL sincronizados!' });
    } catch (error) {
        await loggerService.logAction('EDITADO USUÁRIO', adminName, username, 'ERRO', error.message);
        res.status(500).json({ error: error.message });
    }
};