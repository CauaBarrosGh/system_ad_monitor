const ActiveDirectory = require('activedirectory2');
const adConfig = require('../config/adConfig');
const { ALLOWED_OUS, DOMINIO_PADRAO } = require('../config/constants');

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
                
                const hasPermission = ALLOWED_OUS.some(allowedOU => 
                    userDN.includes(allowedOU.toLowerCase())
                );

                if (!hasPermission) {
                    console.log(`[ACESSO NEGADO] Usuário ${username} fora das pastas permitidas.`);
                    return res.status(403).json({ success: false, message: 'Sem permissão. Você não pertence aos grupos administrativos.' });
                }

                const displayName = userDetail.displayName || username;

                req.session.regenerate(() => {
                    req.session.user = { 
                        username: username, 
                        password: password,
                        displayName: displayName, 
                        role: 'ADMIN' 
                    };
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
    if (!req.session.user) return res.status(401).json({ error: 'Não logado' });
    res.json(req.session.user);
};