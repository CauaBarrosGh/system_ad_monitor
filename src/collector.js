require('dotenv').config();
const ldap = require('ldapjs');
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// --- CONFIGURAÇÕES ---
const AD_CONFIG = {
    url: process.env.AD_URL,
    bindDN: process.env.AD_USER,
    bindCredentials: process.env.AD_PASSWORD,
    searchBase: process.env.AD_BASE,
    scope: 'sub'
};

const MYSQL_CONFIG = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
};

// --- CONSTANTES ---
const NOME_GRUPO_RAIZ = 'grpSegMain';
const IGNORE_GROUPS = ['Domain Users', 'Usuarios do Dominio'];
const DISABLED_OU = 'OU=Desativados,OU=Usuarios,OU=SOC,DC=soc,DC=com,DC=br';

// Globais
let userGroupMap = new Map();
let visitedGroups = new Set();

// --- HELPERS BÁSICOS ---
function getAttr(entry, name) {
    if (entry.object && entry.object[name]) return entry.object[name];
    if (entry.attributes) {
        const attr = entry.attributes.find(a => a.type.toLowerCase() === name.toLowerCase());
        if (attr && attr.values) return attr.values; 
        if (attr && attr.vals) return attr.vals; 
    }
    return null;
}
function cleanValue(val) { return Array.isArray(val) ? (val.length > 0 ? val[0] : null) : val; }
function extractCN(dn) { if (!dn) return ''; const match = dn.match(/CN=([^,]+)/i); return match ? match[1] : dn; }
function extractNameFromDN(dn) { if (!dn) return null; const match = dn.match(/CN=([^,]+)/); return match ? match[1] : dn; }
function escapeLDAPFilter(str) { if (!str) return ''; return str.replace(/\\/g, '\\5c').replace(/\*/g, '\\2a').replace(/\(/g, '\\28').replace(/\)/g, '\\29').replace(/\x00/g, '\\00'); }

// Helpers de Data
function parseADDate(ldapDate) {
    if (!ldapDate) return null;
    if (!isNaN(ldapDate) && Number(ldapDate) > 0) {
        const fileTime = parseInt(ldapDate);
        const date = new Date(fileTime / 10000 - 11644473600000);
        return date.getFullYear() < 1980 ? null : date;
    }
    return null;
}
function parseGeneralizedTime(value) {
    if (!value || typeof value !== 'string' || value.length < 14) return null;
    const y = value.substring(0, 4); const m = value.substring(4, 6); const d = value.substring(6, 8);
    const h = value.substring(8, 10); const min = value.substring(10, 12); const s = value.substring(12, 14);
    return new Date(`${y}-${m}-${d}T${h}:${min}:${s}Z`);
}

// --- LÓGICA DE NEGÓCIO: TIMES ---
function detectTime(groups) {
    if (!groups || groups.length === 0) return 'COLABORADOR';
    const allGroups = groups.map(g => g.toLowerCase()).join(' ');
    if (allGroups.includes('soc - lideres') || allGroups.includes('gd_lideres_rn') || allGroups.includes('gd_lideres_adm_fin')) return 'LIDER';
    if (allGroups.includes('diretoria')) return 'DIRETORIA';
    if (allGroups.includes('administradores')) return 'ADMIN';
    if (allGroups.includes('agilista') || allGroups.includes('scrum') || allGroups.includes('equipe de processo e agilidade')) return 'AGILE';
    if (allGroups.includes('dev - si')) return 'SI';
    if (allGroups.includes('dev - gestão de sistemas internos')) return 'GSI';
    if (allGroups.includes('infra-ti') || allGroups.includes('dev - ti')) return 'INFRA';
    if (allGroups.includes('rh') || allGroups.includes('dho') || allGroups.includes('financeiro') || allGroups.includes('fiscal') || allGroups.includes('administrativo') || allGroups.includes('rn - projetos') || allGroups.includes('contratos') || allGroups.includes('rn - adm-vendas')  || allGroups.includes('adm - serviços gerais') || allGroups.includes('rn - crc') || allGroups.includes('adm - fornecedores')) return 'ADM';
    if (allGroups.includes('desenvolvimento') || allGroups.includes('dev - qualidade') || allGroups.includes('dev - webservices') || allGroups.includes('ragnarok') || allGroups.includes('sparta') || allGroups.includes('avengers') || allGroups.includes('sharks') || allGroups.includes('joker') || allGroups.includes('shield') || allGroups.includes('dynamo') || allGroups.includes('madagaskar') || allGroups.includes('dev')) return 'DEV';
    if (allGroups.includes('comercial') || allGroups.includes('vendas') || allGroups.includes('suporte') || allGroups.includes('sucesso do cliente')  || allGroups.includes('rn - produtos') || allGroups.includes('gd_implantacao') || allGroups.includes('rn - comunicação')) return 'COMERCIAL';
    
    return 'COLABORADOR';
}

// --- LÓGICA DE NEGÓCIO: CÁLCULO DE RISCO (SOC) ---
function calculateRisk(user) {
    let score = 0; let factors = []; const now = new Date();
    if (user.pwdNeverExpires) { score += 40; factors.push("Senha Nunca Expira"); }
    if (user.pwdLastSet) {
        const daysPwd = Math.floor((now - user.pwdLastSet) / (1000 * 60 * 60 * 24));
        if (daysPwd > 180 && !user.pwdNeverExpires) { score += 30; factors.push(`Senha Antiga (${daysPwd}d)`); }
    }
    if (user.isEnabled && user.lastLogon) {
        const daysLogon = Math.floor((now - user.lastLogon) / (1000 * 60 * 60 * 24));
        if (daysLogon > 90) { score += 25; factors.push(`Fantasma (${daysLogon}d off)`); }
    }
    if (user.isAdmin) { score += 15; factors.push("Acesso Admin"); }
    if (user.badPwdCount > 0) { score += 10; factors.push(`Erros de Senha (${user.badPwdCount})`); }
    if (!user.managerName) { score += 5; factors.push("Sem Gestor"); }
    return { score: Math.min(score, 100), factors: JSON.stringify(factors) };
}

// --- CRAWLER DE HIERARQUIA ---
function getObjectByDN(client, dn, attributes) {
    return new Promise((resolve, reject) => {
        const opts = { filter: `(distinguishedName=${escapeLDAPFilter(dn)})`, scope: 'sub', attributes: attributes };
        client.search(AD_CONFIG.searchBase, opts, (err, res) => {
            if (err) return reject(err);
            let result = null;
            res.on('searchEntry', (entry) => result = entry);
            res.on('end', () => resolve(result));
            res.on('error', (e) => reject(e));
        });
    });
}

async function crawlGroup(client, groupDN, parentGroupName) {
    if (visitedGroups.has(groupDN)) return;
    visitedGroups.add(groupDN);
    const groupCN = extractCN(groupDN);
    const entry = await getObjectByDN(client, groupDN, ['member']);
    if (!entry) return;
    let members = getAttr(entry, 'member');
    if (!members) return;
    if (!Array.isArray(members)) members = [members];

    for (const memberDN of members) {
        const memberEntry = await getObjectByDN(client, memberDN, ['objectClass', 'sAMAccountName']);
        if (memberEntry) {
            const classes = getAttr(memberEntry, 'objectClass');
            const clsStr = JSON.stringify(classes).toLowerCase();
            const memberCN = extractCN(memberDN);
            if (clsStr.includes('group') && !IGNORE_GROUPS.includes(memberCN)) {
                await crawlGroup(client, memberDN, groupCN);
            } else if (clsStr.includes('person') || clsStr.includes('user')) {
                const username = cleanValue(getAttr(memberEntry, 'sAMAccountName'));
                if (username) {
                    if (!userGroupMap.has(username)) userGroupMap.set(username, []);
                    userGroupMap.get(username).push(groupCN);
                }
            }
        }
    }
}

async function buildDepartmentMap(client) {
    console.log(`🧩 Mapeando hierarquia de "${NOME_GRUPO_RAIZ}"...`);
    visitedGroups.clear(); userGroupMap.clear();
    const opts = { filter: `(&(objectClass=group)(sAMAccountName=${NOME_GRUPO_RAIZ}))`, scope: 'sub', attributes: ['distinguishedName'] };
    let rootDN = null;
    await new Promise((resolve) => {
        client.search(AD_CONFIG.searchBase, opts, (err, res) => {
            res.on('searchEntry', (e) => rootDN = cleanValue(getAttr(e, 'distinguishedName')));
            res.on('end', resolve);
        });
    });
    if (!rootDN) console.warn(`⚠️ Grupo Raiz "${NOME_GRUPO_RAIZ}" não encontrado.`);
    else await crawlGroup(client, rootDN, 'ROOT');
    console.log(`✅ Mapeamento concluído.`);
}

// --- FETCHERS COM LÓGICA DE EXCLUSÃO (LIMPEZA) ---

async function fetchUsers(client, dbConnection) {
    const GRUPO_ALVO_DN = 'CN=SocTodos,OU=Grupos de Segurança,OU=SOC,DC=soc,DC=com,DC=br';
    const foundUsernames = []; // 🎯 Rastrear quem está no AD

    return new Promise((resolve, reject) => {
        const opts = {
            filter: `(&(objectClass=user)(objectCategory=person)(memberOf=${GRUPO_ALVO_DN}))`,
            scope: 'sub',
            attributes: ['sAMAccountName', 'displayName', 'mail', 'userAccountControl', 'lastLogonTimestamp', 'memberOf', 'dataInicio', 'description', 'manager', 'pwdLastSet', 'adminCount', 'badPwdCount', 'departmentNumber'],
            paged: true
        };

        client.search(AD_CONFIG.searchBase, opts, (err, res) => {
            if (err) return reject(err);
            let count = 0;
            res.on('searchEntry', async (entry) => {
                count++;
                const username = cleanValue(getAttr(entry, 'sAMAccountName'));
                if (!username) return;

                foundUsernames.push(username); // 🎯 Registra que o usuário existe

                const displayName = cleanValue(getAttr(entry, 'displayName')) || username;
                const mail = cleanValue(getAttr(entry, 'mail'));
                const uac = parseInt(cleanValue(getAttr(entry, 'userAccountControl')) || 0);
                const isEnabled = !((uac & 2) === 2);
                const pwdNeverExpires = ((uac & 65536) === 65536);
                const lastLogonDate = parseADDate(cleanValue(getAttr(entry, 'lastLogonTimestamp')));
                const dataInicio = parseGeneralizedTime(cleanValue(getAttr(entry, 'dataInicio')));
                const jobTitle = cleanValue(getAttr(entry, 'description'));
                const managerName = extractNameFromDN(cleanValue(getAttr(entry, 'manager')));
                const pwdLastSet = parseADDate(cleanValue(getAttr(entry, 'pwdLastSet')));
                const adminCount = parseInt(cleanValue(getAttr(entry, 'adminCount')) || 0);
                const isAdmin = adminCount > 0;
                const badPwdCount = parseInt(cleanValue(getAttr(entry, 'badPwdCount')) || 0);
                const seniority = cleanValue(getAttr(entry, 'departmentNumber')); 

                let rawGroups = getAttr(entry, 'memberOf');
                let groups = Array.isArray(rawGroups) ? rawGroups : (rawGroups ? [rawGroups] : []);
                const userTeam = detectTime(groups);

                let specificGroup = 'Geral';
                if (userGroupMap.has(username)) {
                    const mappedGroups = userGroupMap.get(username);
                    const leaderGroup = mappedGroups.find(g => g.toLowerCase().includes('lider') || g.toLowerCase().includes('gest'));
                    specificGroup = leaderGroup || mappedGroups[mappedGroups.length - 1];
                }

                const risk = calculateRisk({ pwdNeverExpires, pwdLastSet, isEnabled, lastLogon: lastLogonDate, isAdmin, badPwdCount, managerName });

                try {
                    await dbConnection.execute(
                        `INSERT INTO users_ad (
                            username, display_name, email, data_inicio, is_enabled, last_logon, 
                            role, job_title, department, seniority, manager, pwd_last_set,
                            bad_pwd_count, is_admin, pwd_never_expires, risk_score, risk_factors
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE 
                            display_name=VALUES(display_name), job_title=VALUES(job_title), email=VALUES(email), is_enabled=VALUES(is_enabled), 
                            last_logon=VALUES(last_logon), role=VALUES(role), department=VALUES(department), 
                            seniority=VALUES(seniority), manager=VALUES(manager), pwd_last_set=VALUES(pwd_last_set),
                            bad_pwd_count=VALUES(bad_pwd_count), is_admin=VALUES(is_admin), 
                            pwd_never_expires=VALUES(pwd_never_expires), risk_score=VALUES(risk_score), 
                            risk_factors=VALUES(risk_factors), collected_at=CURRENT_TIMESTAMP`,
                        [username, displayName, mail, dataInicio, isEnabled, lastLogonDate, 
                         userTeam, jobTitle, specificGroup, seniority, managerName, pwdLastSet,
                         badPwdCount, isAdmin, pwdNeverExpires, risk.score, risk.factors]
                    );
                } catch (dbErr) { console.error(`Erro SQL (${username}):`, dbErr.message); }
            });

            res.on('end', async () => {
                // 🎯 LÓGICA DE EXCLUSÃO DEFINITIVA
                if (foundUsernames.length > 0) {
                    try {
                        const [result] = await dbConnection.query('DELETE FROM users_ad WHERE username NOT IN (?)', [foundUsernames]);
                        if (result.affectedRows > 0) console.log(`🧹 [LIMPEZA] Usuários removidos do DB por não estarem no AD: ${result.affectedRows}`);
                    } catch (e) { console.error('❌ Erro na limpeza de usuários:', e.message); }
                }
                console.log(`✅ [USUÁRIOS] Fim: ${count}`);
                resolve();
            });
            res.on('error', (err) => reject(err));
        });
    });
}

async function fetchComputers(client, dbConnection) {
    console.log('💻 [COMPUTADORES] Coletando...');
    const foundHostnames = [];
    return new Promise((resolve, reject) => {
        const opts = { filter: '(&(objectClass=computer))', scope: 'sub', attributes: ['cn', 'operatingSystem', 'operatingSystemVersion', 'whenCreated', 'lastLogonTimestamp'], paged: true };
        client.search(AD_CONFIG.searchBase, opts, (err, res) => {
            if (err) return reject(err);
            res.on('searchEntry', async (entry) => {
                const hostname = cleanValue(getAttr(entry, 'cn'));
                if (!hostname) return;
                foundHostnames.push(hostname);
                const osName = cleanValue(getAttr(entry, 'operatingSystem')) || 'Desconhecido';
                const osVersion = cleanValue(getAttr(entry, 'operatingSystemVersion'));
                const createdDate = parseGeneralizedTime(cleanValue(getAttr(entry, 'whenCreated')));
                const lastLogonDate = parseADDate(cleanValue(getAttr(entry, 'lastLogonTimestamp')));
                let isActive = false;
                if (lastLogonDate) { const n = new Date(); n.setDate(n.getDate() - 90); isActive = lastLogonDate > n; }
                try {
                    await dbConnection.execute(
                        `INSERT INTO computers_ad (hostname, os_name, os_version, created_at, last_logon, is_active) 
                         VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE os_name=VALUES(os_name), last_logon=VALUES(last_logon), is_active=VALUES(is_active)`,
                        [hostname, osName, osVersion, createdDate, lastLogonDate, isActive]
                    );
                } catch (e) {}
            });
            res.on('end', async () => {
                if (foundHostnames.length > 0) {
                    try {
                        const [result] = await dbConnection.query('DELETE FROM computers_ad WHERE hostname NOT IN (?)', [foundHostnames]);
                        if (result.affectedRows > 0) console.log(`🧹 [LIMPEZA] PCs removidos do DB: ${result.affectedRows}`);
                    } catch (e) { console.error('Erro limpeza PCs:', e.message); }
                }
                resolve();
            });
            res.on('error', reject);
        });
    });
}

async function fetchDisabledUsers(client, dbConnection) {
    console.log('🚫 [DESATIVADOS] Coletando...');
    const foundDisabled = [];
    return new Promise((resolve, reject) => {
        const opts = {
            filter: '(&(objectClass=user)(objectCategory=person)(userAccountControl:1.2.840.113556.1.4.803:=2))',
            scope: 'sub',
            attributes: ['sAMAccountName', 'displayName', 'description', 'department', 'whenChanged'],
            paged: true
        };
        client.search(DISABLED_OU, opts, (err, res) => {
            if (err) return reject(err);
            let count = 0;
            res.on('searchEntry', async (entry) => {
                count++;
                const username = cleanValue(getAttr(entry, 'sAMAccountName'));
                if (!username) return;
                foundDisabled.push(username);
                const displayName = cleanValue(getAttr(entry, 'displayName')) || username;
                const description = cleanValue(getAttr(entry, 'description')) || null;
                const department = cleanValue(getAttr(entry, 'department')) || null;
                const whenChanged = parseGeneralizedTime(cleanValue(getAttr(entry, 'whenChanged')));
                try {
                    await dbConnection.execute(
                        `INSERT INTO disabled_users_ad (username, display_name, description, department, when_changed) 
                         VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE display_name=VALUES(display_name), description=VALUES(description), when_changed=VALUES(when_changed)`,
                        [username, displayName, description, department, whenChanged]
                    );
                } catch (e) {}
            });
            res.on('end', async () => {
                if (foundDisabled.length > 0) {
                    try {
                        const [result] = await dbConnection.query('DELETE FROM disabled_users_ad WHERE username NOT IN (?)', [foundDisabled]);
                        if (result.affectedRows > 0) console.log(`🧹 [LIMPEZA] Desativados removidos: ${result.affectedRows}`);
                    } catch (e) {}
                }
                console.log(`✅ [DESATIVADOS] Fim: ${count}`);
                resolve();
            });
            res.on('error', reject);
        });
    });
}

// MAIN: orquestra execução
async function main() {
    console.log('--- 🛡️ INICIANDO COLETOR SOC ---');
    const args = process.argv.slice(2);
    const shouldRunComputers = args.includes('--computers') || args.length === 0;
    const shouldRunUsers = args.includes('--users') || args.length === 0;

    let dbConnection;
    try { dbConnection = await mysql.createConnection(MYSQL_CONFIG); } catch (e) { process.exit(1); }

    const client = ldap.createClient({ url: AD_CONFIG.url });
    return new Promise((resolve, reject) => {
        client.bind(AD_CONFIG.bindDN, AD_CONFIG.bindCredentials, async (err) => {
            if (err) { dbConnection.end(); return reject(err); }
            try {
                if (shouldRunUsers) {
                    await buildDepartmentMap(client); 
                    await fetchUsers(client, dbConnection);
                    await fetchDisabledUsers(client, dbConnection);
                }
                if (shouldRunComputers) await fetchComputers(client, dbConnection);
                console.log('\n✨ DADOS SINCRONIZADOS COM SUCESSO.');
                resolve();
            } catch (execErr) { reject(execErr); } 
            finally { client.unbind(); await dbConnection.end(); }
        });
    });
}

// EXPORTS PARA API
async function runJustDisabledUsers() {
    let dbConnection = await mysql.createConnection(MYSQL_CONFIG);
    const client = ldap.createClient({ url: AD_CONFIG.url });
    return new Promise((resolve, reject) => {
        client.bind(AD_CONFIG.bindDN, AD_CONFIG.bindCredentials, async (err) => {
            if (err) { dbConnection.end(); return reject(err); }
            try { await fetchDisabledUsers(client, dbConnection); resolve(); } 
            catch (e) { reject(e); } finally { client.unbind(); await dbConnection.end(); }
        });
    });
}

async function syncUsers() {
    let dbConnection = await mysql.createConnection(MYSQL_CONFIG);
    const client = ldap.createClient({ url: AD_CONFIG.url });
    return new Promise((resolve, reject) => {
        client.bind(AD_CONFIG.bindDN, AD_CONFIG.bindCredentials, async (err) => {
            if (err) { dbConnection.end(); return reject(err); }
            try { await buildDepartmentMap(client); await fetchUsers(client, dbConnection); resolve(); } 
            catch (e) { reject(e); } finally { client.unbind(); await dbConnection.end(); }
        });
    });
}

if (require.main === module) main();
else module.exports = { main, runJustDisabledUsers, syncUsers };