require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const path = require('path');
const routes = require('./routes');
const { requireAuth } = require('./middleware/auth');
const logger = require('./services/loggerService');
const app = express();

// --- CONFIGURAÇÃO DO EXPRESS ---

// CORS
app.use(cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Segurança e Parser
app.use(helmet({ contentSecurityPolicy: false, hsts: false }));
app.use(express.json());

// Sessão
const isProduction = process.env.NODE_ENV === 'production';
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secreto_dev_apenas',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 3600000
    }
}));

// --- ROTAS E ARQUIVOS ESTÁTICOS ---

// Servir Assets (CSS, JS, Img) como PÚBLICOS
app.use(express.static(path.join(__dirname, '../public')));

// Rota de Login (Pública)
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/html/login.html'));
});

// Fallback para quem acessar /login.html direto na URL
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/html/login.html'));
});

// API Routes (Backend)
app.use(routes);

// Dashboard (Protegido)
// Quando acessar a raiz '/', verifica login e entrega o index.html que está na pasta html
app.get('/', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/html/index.html'));
});

// Fallback: Qualquer outra rota não encontrada redireciona para login ou home
app.get(/.*/, (req, res) => {
    if (req.session && req.session.user) {
        res.redirect('/');
    } else {
        res.redirect('/login');
    }
});

// Start Server
const PORT = process.env.API_PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🔒 Servidor WEB rodando em http://localhost:${PORT}`);
});