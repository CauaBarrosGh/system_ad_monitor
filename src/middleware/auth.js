exports.requireAuth = (req, res, next) => {
    if (req.session && req.session.user) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Não autorizado' });
    res.redirect('/html/login.html');
};