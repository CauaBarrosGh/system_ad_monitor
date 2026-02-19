const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const dashboardController = require('../controllers/dashboardController');
const userController = require('../controllers/userController');
const auditController = require('../controllers/auditController');
const { requireAuth } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');
const disabledController = require('../controllers/disabledController');
const computerController = require('../controllers/computerController');
const systemController = require('../controllers/systemController'); 

// --- Auth Routes ---
router.post('/auth/login', loginLimiter, authController.login);
router.get('/auth/logout', authController.logout);
router.get('/api/me', authController.me);

// --- Dashboard Data ---
router.get('/api/kpis', requireAuth, dashboardController.getKPIs);
router.get('/api/users', requireAuth, dashboardController.getAllUsers);
router.get('/api/computers', requireAuth, dashboardController.getComputers);
router.get('/api/security', requireAuth, dashboardController.getSecurityRisks);

// --- Auditoria  ---
router.get('/api/audit', requireAuth, auditController.getAuditLogs);

// --- Desbloquear User) ---
router.post('/api/users/:username/unlock', requireAuth, userController.unlockUser);

// --- Desativar User ---
router.post('/api/users/:username/disable', requireAuth, userController.disableUser);

// --- Users Desativados ---
router.get('/api/disabled-users', requireAuth, disabledController.getDisabledUsers);

// Rota para DELETAR definitivamente
router.delete('/api/disabled/:username', requireAuth, userController.deleteDisabledUser);

// Rota para deletar computador
router.delete('/api/inventory/computers/:computerName', requireAuth, computerController.deleteComputer);

// Rodar collector
router.post('/system/sync', systemController.runCollector);

// Criar usuario
router.post('/api/users', requireAuth, userController.createUser);

// --- Novas Rotas de Edição ---
router.get('/api/users/:username/details', requireAuth, userController.getUserData);
router.put('/api/users/:username', requireAuth, userController.editUser);

module.exports = router;