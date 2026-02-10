const ActiveDirectory = require('activedirectory2');
const adConfig = require('../config/adConfig');
const { RESTRICTED_OU, DOMINIO_PADRAO } = require('../config/constants');

exports.login = (req, res) => {
    let { username, password } = req.body;

    if (!username || !password) return res.status(400).json({ success: false, message: 'Dados incompletos.' });

    if (!username.includes('@') && !username.includes('\\')) username = `${username}@${DOMINIO_PADRAO}`;

    const ad = new ActiveDirectory(adConfig);

    ad.authenticate(username, password, function (err, auth) {
        if (err) {
            console.error('Erro Login:', err);
            return res.status(401).json({ success: false, message: 'Credenciais inválidas ou erro no AD.' });
        }

        if (auth) {
            ad.findUser(username, function (err, userDetail) {
                if (err || !userDetail) {
                    return res.status(401).json({ success: false, message: 'Erro ao buscar dados do usuário.' });
                }

                const userDN = userDetail.dn.toLowerCase();
                const requiredOU = RESTRICTED_OU.toLowerCase();

                if (!userDN.includes(requiredOU)) {
                    console.log(`[ACESSO NEGADO] Usuário ${username} fora da pasta permitida.`);
                    return res.status(403).json({ success: false, message: 'Sem permissão. Você não é Admin.' });
                }

                const displayName = userDetail.displayName || username;

                req.session.regenerate(() => {
                    req.session.user = { username, displayName: displayName, role: 'ADMIN' };
                    console.log(`[LOGIN SUCESSO] Admin logado: ${displayName}`);
                    res.json({ success: true });
                });
            });
        } else {
            res.status(401).json({ success: false, message: 'Credenciais inválidas.' });
        }
    });
};

exports.logout = (req, res) => {
    req.session.destroy(() => {
        res.redirect('/html/login.html');
    });
};

exports.me = (req, res) => {
    res.json(req.session.user);
};