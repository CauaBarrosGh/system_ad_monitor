const rateLimit = require('express-rate-limit');

exports.loginLimiter = rateLimit({
    windowMs: 30 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Muitas tentativas de login. Bloqueado por 30 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
});