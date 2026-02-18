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
const MANUAL_GROUPS = ['Dev - SI','Dev - Agilidade - EPA','Adm - Serviços Gerais','Dev - Terceiros','Dev - Lideres',];
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
    let score = 0;
    let factors = [];
    const now = new Date();

    // 1. Senha Nunca Expira (Risco Crítico)
    if (user.pwdNeverExpires) {
        score += 40;
        factors.push("Senha Nunca Expira");
    }

    // 2. Senha Antiga (> 180 dias)
    if (user.pwdLastSet) {
        const daysPwd = Math.floor((now - user.pwdLastSet) / (1000 * 60 * 60 * 24));
        if (daysPwd > 180 && !user.pwdNeverExpires) {
            score += 30;
            factors.push(`Senha Antiga (${daysPwd}d)`);
        }
    }

    // 3. Conta Fantasma (Ativo mas sem logon > 90 dias)
    if (user.isEnabled && user.lastLogon) {
        const daysLogon = Math.floor((now - user.lastLogon) / (1000 * 60 * 60 * 24));
        if (daysLogon > 90) {
            score += 25;
            factors.push(`Fantasma (${daysLogon}d off)`);
        }
    }

    // 4. Admin Count (VIP Target)
    if (user.isAdmin) {
        score += 15;
        factors.push("Acesso Admin");
    }

    // 5. Erros de Senha Recentes
    if (user.badPwdCount > 0) {
        score += 10;
        factors.push(`Erros de Senha (${user.badPwdCount})`);
    }

    // 6. Sem Gestor
    if (!user.managerName) {
        score += 5;
        factors.push("Sem Gestor");
    }

    // Cap em 100
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

    // Busca o DN do grupo raiz pelo sAMAccountName
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


// FETCH USERS (coleta usuários do grupo alvo do AD e grava no MySQL)
async function fetchUsers(client, dbConnection) {

    // (Manutenção) GRUPO PRINCIPAL DOS USERS
    const GRUPO_ALVO_DN = 'CN=SocTodos,OU=Grupos de Segurança,OU=SOC,DC=soc,DC=com,DC=br';

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

                // Coleta dos Dados
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

                // Grupos e Role
                let rawGroups = getAttr(entry, 'memberOf');
                let groups = [];
                if (Array.isArray(rawGroups)) groups = rawGroups; else if (typeof rawGroups === 'string') groups = [rawGroups];
                const userTeam = detectTime(groups);

                // Departamento
                let specificGroup = 'Geral';
                if (userGroupMap.has(username)) {
                    const mappedGroups = userGroupMap.get(username);
                    const leaderGroup = mappedGroups.find(g => g.toLowerCase().includes('lider') || g.toLowerCase().includes('gest'));
                    specificGroup = leaderGroup || mappedGroups[mappedGroups.length - 1];
                }
                if (specificGroup === 'Geral' && groups.length > 0) {
                    const userGroupNames = groups.map(dn => extractCN(dn));
                    const manualMatch = userGroupNames.find(gn => MANUAL_GROUPS.includes(gn));
                    if (manualMatch) specificGroup = manualMatch;
                }

                // Cálculo de Risco
                const risk = calculateRisk({
                    pwdNeverExpires, pwdLastSet, isEnabled, lastLogon: lastLogonDate, 
                    isAdmin, badPwdCount, managerName
                });

                 // Persistência (UPSERT Insere ou atualiza por chave única)
                try {
                    await dbConnection.execute(
                        `INSERT INTO users_ad (
                            username, display_name, email, data_inicio, is_enabled, last_logon, 
                            role, job_title, department, seniority, manager, pwd_last_set,
                            bad_pwd_count, is_admin, pwd_never_expires, risk_score, risk_factors
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE 
                            display_name=VALUES(display_name), email=VALUES(email), is_enabled=VALUES(is_enabled), 
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
            res.on('end', () => { console.log(`✅ [USUÁRIOS] Fim: ${count}`); resolve(); });
            res.on('error', (err) => reject(err));
        });
    });
}


// FETCH COMPUTERS (coleta computadores do AD e grava no MySQL)
async function fetchComputers(client, dbConnection) {
    console.log('💻 [COMPUTADORES] Coletando...');
    return new Promise((resolve, reject) => {
        const opts = { filter: '(&(objectClass=computer))', scope: 'sub', attributes: ['cn', 'operatingSystem', 'operatingSystemVersion', 'whenCreated', 'lastLogonTimestamp'], paged: true };
        client.search(AD_CONFIG.searchBase, opts, (err, res) => {
            if (err) return reject(err);
            res.on('searchEntry', async (entry) => {
                const hostname = cleanValue(getAttr(entry, 'cn'));
                if (!hostname) return;
                const osName = cleanValue(getAttr(entry, 'operatingSystem')) || 'Desconhecido';
                const osVersion = cleanValue(getAttr(entry, 'operatingSystemVersion'));
                const createdDate = parseGeneralizedTime(cleanValue(getAttr(entry, 'whenCreated')));
                const lastLogonDate = parseADDate(cleanValue(getAttr(entry, 'lastLogonTimestamp')));
                let isActive = false;
                if (lastLogonDate) { const n = new Date(); n.setDate(n.getDate() - 90); isActive = lastLogonDate > n; }
                try {
                    await dbConnection.execute(
                        `INSERT INTO computers_ad (hostname, os_name, os_version, created_at, last_logon, is_active) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE os_name=VALUES(os_name), last_logon=VALUES(last_logon), is_active=VALUES(is_active)`,
                        [hostname, osName, osVersion, createdDate, lastLogonDate, isActive]
                    );
                } catch (e) {}
            });
            res.on('end', () => resolve());
            res.on('error', reject);
        });
    });
}

// FETCH DISABLED USERS (coleta usuários da OU=Desativados e grava no MySQL)
async function fetchDisabledUsers(client, dbConnection) {
    console.log('🚫 [DESATIVADOS] Coletando da OU=Desativados...');

    return new Promise((resolve, reject) => {
        const opts = {
            // Garante que são users e que estão desabilitados (bit 2 do UAC)
            filter: '(&(objectClass=user)(objectCategory=person)(userAccountControl:1.2.840.113556.1.4.803:=2))',
            scope: 'sub',
            attributes: [
                'sAMAccountName',
                'displayName',
                'description',     // "Desligado em dd/mm/yyyy"
                'department',      // se existir no AD
                'whenChanged'      // data da mudança no AD
            ],
            paged: true
        };

        client.search(DISABLED_OU, opts, (err, res) => {
            if (err) return reject(err);

            let count = 0;

            res.on('searchEntry', async (entry) => {
                count++;

                const username = cleanValue(getAttr(entry, 'sAMAccountName'));
                if (!username) return;

                const displayName = cleanValue(getAttr(entry, 'displayName')) || username;
                const description = cleanValue(getAttr(entry, 'description')) || null;

                // departamento (se AD tiver esse atributo)
                const department = cleanValue(getAttr(entry, 'department')) || null;

                // whenChanged vem em GeneralizedTime (ex: 20231031120000.0Z)
                const whenChanged = parseGeneralizedTime(cleanValue(getAttr(entry, 'whenChanged')));

                try {
                    await dbConnection.execute(
                        `INSERT INTO disabled_users_ad (
                            username, display_name, description, department, when_changed
                        ) VALUES (?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            display_name = VALUES(display_name),
                            description  = VALUES(description),
                            department   = VALUES(department),
                            when_changed = VALUES(when_changed)`,
                        [username, displayName, description, department, whenChanged]
                    );
                } catch (dbErr) {
                    console.error(`❌ [DESATIVADOS] Erro SQL (${username}):`, dbErr.message);
                }
            });

            res.on('end', () => {
                console.log(`✅ [DESATIVADOS] Fim: ${count}`);
                resolve();
            });

            res.on('error', reject);
        });
    });
}

// MAIN: orquestra execução
// - Conecta MySQL
// - Faz bind no AD
// - Executa: buildDepartmentMap -> fetchUsers -> fetchComputers
// - Fecha conexões (unbind/end)
async function main() {
    console.log('--- 🛡️ INICIANDO COLETOR SOC (RISK SCORE ATIVO) ---');

    // 1. DETECTAR ARGUMENTOS
    const args = process.argv.slice(2);
    
    // Se args estiver vazio, roda tudo. Se tiver flag, roda só o pedido.
    const shouldRunComputers = args.includes('--computers') || args.length === 0;
    const shouldRunUsers = args.includes('--users') || args.length === 0;

    console.log(`📋 Modo: ${args.length === 0 ? 'COMPLETO' : args.join(', ')}`);

    let dbConnection;
    try { 
        dbConnection = await mysql.createConnection(MYSQL_CONFIG); 
    } catch (e) { 
        console.error('❌ Erro Banco:', e.message);
        if (require.main === module) process.exit(1);
        throw e;
    }

    const client = ldap.createClient({ url: AD_CONFIG.url });

    return new Promise((resolve, reject) => {
        client.bind(AD_CONFIG.bindDN, AD_CONFIG.bindCredentials, async (err) => {
            if (err) { 
                console.error('❌ Erro Login AD:', err); 
                dbConnection.end(); 
                if (require.main === module) process.exit(1);
                return reject(err); 
            }

            try {
                // 2. EXECUÇÃO CONDICIONAL
                
                // --- BLOCO DE USUÁRIOS ---
                if (shouldRunUsers) {
                    console.log('\n👥 Iniciando fluxo de USUÁRIOS...');
                    await buildDepartmentMap(client); 
                    await fetchUsers(client, dbConnection);
                    await fetchDisabledUsers(client, dbConnection);
                }

                // --- BLOCO DE COMPUTADORES ---
                if (shouldRunComputers) {
                    console.log('\n💻 Iniciando fluxo de COMPUTADORES...');
                    await fetchComputers(client, dbConnection);
                }

                console.log('\n✨ DADOS SINCRONIZADOS COM SUCESSO.');
                resolve();

            } catch (execErr) { 
                console.error('❌ Erro durante execução:', execErr); 
                if (require.main === module) process.exit(1);
                reject(execErr);

            } finally { 
                client.unbind(); 
                await dbConnection.end(); 
                if (require.main === module) process.exit(0);
            }
        });
    });
}

// --- FUNÇÃO EXCLUSIVA PARA A API (Apenas atualiza os Desativados) ---
async function runJustDisabledUsers() {
    console.log('🔄 [API] Coletor invocado para sincronizar usuários desativados...');
    let dbConnection;
    try { 
        dbConnection = await mysql.createConnection(MYSQL_CONFIG); 
    } catch (e) { 
        console.error('❌ [API] Erro Banco:', e.message);
        throw e;
    }

    const client = ldap.createClient({ url: AD_CONFIG.url });

    return new Promise((resolve, reject) => {
        client.bind(AD_CONFIG.bindDN, AD_CONFIG.bindCredentials, async (err) => {
            if (err) { 
                dbConnection.end(); 
                return reject(err); 
            }
            try {
                await fetchDisabledUsers(client, dbConnection);
                resolve();
            } catch (execErr) { 
                reject(execErr);
            } finally { 
                client.unbind(); 
                await dbConnection.end(); 
            }
        });
    });
}

// Criação de Usuário
async function syncUsers() {
    console.log('🔄 [API] Coletor invocado para sincronizar usuários ATIVOS...');
    let dbConnection;
    try { 
        dbConnection = await mysql.createConnection(MYSQL_CONFIG); 
    } catch (e) { 
        console.error('❌ [API] Erro Banco:', e.message);
        throw e;
    }

    const client = ldap.createClient({ url: AD_CONFIG.url });

    return new Promise((resolve, reject) => {
        client.bind(AD_CONFIG.bindDN, AD_CONFIG.bindCredentials, async (err) => {
            if (err) { 
                dbConnection.end(); 
                return reject(err); 
            }
            try {
                // Precisamos mapear os departamentos/líderes primeiro
                await buildDepartmentMap(client);
                // Agora buscamos os usuários e atualizamos o banco
                await fetchUsers(client, dbConnection);
                
                console.log('✅ [API] Sincronização de usuários concluída.');
                resolve();
            } catch (execErr) { 
                console.error('❌ [API] Erro no syncUsers:', execErr);
                reject(execErr);
            } finally { 
                client.unbind(); 
                await dbConnection.end(); 
            }
        });
    });
}

// --- CONTROLE DE EXECUÇÃO ---
// Se o arquivo foi chamado diretamente pelo terminal (node collector.js)
if (require.main === module) {
    main();
} 
// Se o arquivo foi importado pela API
else {
    module.exports = {
        main,
        runJustDisabledUsers,
        syncUsers 
    };
}