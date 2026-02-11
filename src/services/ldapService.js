const ldap = require('ldapjs');
const { DISABLED_OU } = require('../config/constants');

// Função auxiliar para formatar data (DD/MM/AAAA)
function getFormattedDate() {
    const now = new Date();
    return now.toLocaleDateString('pt-BR');
}

// Função auxiliar para extrair valor de um atributo cru
function getAttributeValue(attributes, name) {
    const attr = attributes.find(a => a.type.toLowerCase() === name.toLowerCase());
    if (!attr) return null;
    if (attr.values && attr.values.length > 0) return attr.values;
    if (attr.vals && attr.vals.length > 0) return attr.vals;
    return null;
}

// --- DESBLOQUEAR USUÁRIO ---
exports.unlockUserByGUID = (username, adminUser, adminPass) => {
    return new Promise((resolve, reject) => {
        const client = ldap.createClient({
            url: process.env.AD_URL,
            tlsOptions: { rejectUnauthorized: false }
        });

        // 🔑 Usa a credencial de quem clicou, ou cai para o .env se for sistema automático
        const bindUser = adminUser || process.env.AD_USER;
        const bindPass = adminPass || process.env.AD_PASSWORD;

        client.bind(bindUser, bindPass, (bindErr) => {
            if (bindErr) {
                client.unbind();
                console.error(`[LDAP SERVICE] Erro de Bind: ${bindErr.message}`);
                return reject(new Error('Erro de autenticação no AD. Verifique suas permissões.'));
            }

            const searchOptions = {
                filter: `(sAMAccountName=${username})`,
                scope: 'sub',
                attributes: ['objectGUID']
            };

            client.search(process.env.AD_BASE, searchOptions, (searchErr, searchRes) => {
                if (searchErr) {
                    client.unbind();
                    return reject(new Error('Erro na busca LDAP.'));
                }

                let userGUID = null;
                let DNConstructor = null;

                searchRes.on('searchEntry', (entry) => {
                    if (entry.objectName && entry.objectName.constructor) {
                        DNConstructor = entry.objectName.constructor;
                    }
                    const guidAttr = entry.attributes.find(a => a.type.toLowerCase() === 'objectguid');
                    if (guidAttr) {
                        if (guidAttr.buffers && guidAttr.buffers.length > 0) {
                            userGUID = guidAttr.buffers[0].toString('hex');
                        } else if (guidAttr.values && guidAttr.values.length > 0) {
                            userGUID = Buffer.from(guidAttr.values[0], 'binary').toString('hex');
                        }
                    }
                });

                searchRes.on('end', (result) => {
                    if (!userGUID) {
                        client.unbind();
                        return reject(new Error('Usuário não encontrado ou sem GUID.'));
                    }

                    const magicString = `<GUID=${userGUID}>`;
                    let targetDN;

                    if (DNConstructor) {
                        targetDN = new DNConstructor();
                        targetDN.toString = () => magicString;
                        targetDN.format = () => magicString;
                    } else {
                        targetDN = magicString;
                    }

                    const change = new ldap.Change({
                        operation: 'replace',
                        modification: {
                            type: 'lockoutTime',
                            values: ['0']
                        }
                    });

                    client.modify(targetDN, change, (modErr) => {
                        client.unbind();
                        if (modErr) {
                            return reject(new Error(modErr.message));
                        }
                        resolve(true);
                    });
                });
                
                searchRes.on('error', (err) => {
                    client.unbind();
                    reject(err);
                });
            });
        });
    });
};

// --- DESATIVAR USUÁRIO ---
exports.disableUserFullProcess = (username, adminUser, adminPass) => {
    return new Promise((resolve, reject) => {
        
        console.log(`\n--- 🕵️ INICIANDO PROCESSO DE DESLIGAMENTO: ${username} ---`);

        const client = ldap.createClient({
            url: process.env.AD_URL,
            tlsOptions: { rejectUnauthorized: false },
            connectTimeout: 10000,
            timeout: 10000 
        });

        client.on('error', (err) => console.error('[CLIENT ERR]', err.message));

        // 🔑 Usa a credencial dinâmica
        const bindUser = adminUser || process.env.AD_USER;
        const bindPass = adminPass || process.env.AD_PASSWORD;

        client.bind(bindUser, bindPass, (bindErr) => {
            if (bindErr) {
                client.unbind();
                return reject(new Error('Erro de autenticação no AD. Verifique suas permissões.'));
            }

            const searchOptions = {
                filter: `(sAMAccountName=${username})`,
                scope: 'sub',
                paged: true,
                sizeLimit: 0,
                attributes: ['dn', 'cn', 'memberOf', 'userAccountControl', 'displayName', 'objectGUID']
            };

            client.search(process.env.AD_BASE, searchOptions, (searchErr, searchRes) => {
                if (searchErr) {
                    client.unbind();
                    return reject(new Error('Erro ao iniciar busca.'));
                }

                let userData = null;

                searchRes.on('searchEntry', (entry) => {
                    
                    const cnVals = getAttributeValue(entry.attributes, 'cn');
                    const uacVals = getAttributeValue(entry.attributes, 'userAccountControl');
                    const displayVals = getAttributeValue(entry.attributes, 'displayName');
                    const memberOfVals = getAttributeValue(entry.attributes, 'memberOf');
                    
                    let userGUID = null;
                    const guidAttr = entry.attributes.find(a => a.type.toLowerCase() === 'objectguid');
                    if (guidAttr) {
                        if (guidAttr.buffers && guidAttr.buffers.length > 0) {
                            userGUID = guidAttr.buffers[0].toString('hex');
                        } else if (guidAttr.values && guidAttr.values.length > 0) {
                            userGUID = Buffer.from(guidAttr.values[0], 'binary').toString('hex');
                        }
                    }

                    userData = {
                        dn: entry.objectName.toString(),
                        dnRaw: entry.objectName,
                        cn: cnVals ? cnVals[0] : '',
                        userAccountControl: uacVals ? uacVals[0] : '512',
                        displayName: displayVals ? displayVals[0] : username,
                        memberOf: memberOfVals || [],
                        guid: userGUID
                    };
                });

                searchRes.on('end', async () => {
                    if (!userData) {
                        client.unbind();
                        return reject(new Error('Usuário não encontrado na busca.'));
                    }

                    try {
                        // --- REMOVER DOS GRUPOS ---
                        let groups = Array.isArray(userData.memberOf) ? userData.memberOf : [userData.memberOf];
                        groups = groups.filter(g => g);
                        groups.forEach(g => console.log(`  - ${g}`));

                        for (const groupDN of groups) {
                            if (groupDN.toLowerCase().includes('domain users') || 
                                groupDN.toLowerCase().includes('usuários do domínio')) {
                                console.log(`⏩ [INFO] Pulando grupo primário: ${groupDN}`);
                                continue;
                            }

                            await new Promise((resolveGroup) => {
                                const cnMatch = groupDN.match(/^CN=([^,]+)/);
                                if (!cnMatch) {
                                    console.log(`⚠️ [AVISO] Não foi possível extrair CN de: ${groupDN}`);
                                    return resolveGroup();
                                }
                                
                                const groupCN = cnMatch[1];
                                
                                const groupSearchOptions = {
                                    filter: `(&(objectClass=group)(cn=${groupCN}))`,
                                    scope: 'sub',
                                    attributes: ['objectGUID', 'distinguishedName', 'cn']
                                };
                                
                                client.search(process.env.AD_BASE, groupSearchOptions, (searchErr, searchRes) => {
                                    if (searchErr) {
                                        console.log(`⚠️ [AVISO] Erro ao buscar grupo: ${searchErr.message}`);
                                        return resolveGroup();
                                    }
                                    
                                    let groupGUID = null;
                                    let DNConstructor = null;
                                    
                                    searchRes.on('searchEntry', (entry) => {
                                        if (entry.objectName && entry.objectName.constructor) {
                                            DNConstructor = entry.objectName.constructor;
                                        }
                                        
                                        const guidAttr = entry.attributes.find(a => a.type.toLowerCase() === 'objectguid');
                                        if (guidAttr) {
                                            if (guidAttr.buffers && guidAttr.buffers.length > 0) {
                                                groupGUID = guidAttr.buffers[0].toString('hex');
                                            } else if (guidAttr.values && guidAttr.values.length > 0) {
                                                groupGUID = Buffer.from(guidAttr.values[0], 'binary').toString('hex');
                                            }
                                        }
                                        
                                        if (groupGUID) {
                                            const magicString = `<GUID=${groupGUID}>`;
                                            let targetGroupDN;
                                            
                                            if (DNConstructor) {
                                                targetGroupDN = new DNConstructor();
                                                targetGroupDN.toString = () => magicString;
                                                targetGroupDN.format = () => magicString;
                                            } else {
                                                targetGroupDN = magicString;
                                            }
                                            
                                            const change = new ldap.Change({
                                                operation: 'delete',
                                                modification: {
                                                    type: 'member',
                                                    values: [userData.dn]
                                                }
                                            });
                                            
                                            client.modify(targetGroupDN, change, (modErr) => {
                                                if (modErr) {
                                                    console.log(`⚠️ [AVISO] Falha ao remover: ${modErr.message}`);
                                                } else {
                                                    console.log(`🗑️ [SUCESSO] Removido do grupo: ${groupCN}`);
                                                }
                                                resolveGroup();
                                            });
                                        } else {
                                            console.log(`⚠️ [AVISO] GUID não encontrado para o grupo`);
                                            resolveGroup();
                                        }
                                    });
                                    
                                    searchRes.on('end', () => {
                                        if (!groupGUID) {
                                            console.log(`⚠️ [AVISO] Grupo "${groupCN}" não encontrado ou sem GUID`);
                                            resolveGroup();
                                        }
                                    });
                                    
                                    searchRes.on('error', (err) => {
                                        console.log(`⚠️ [AVISO] Erro na busca: ${err.message}`);
                                        resolveGroup();
                                    });
                                });
                            });
                        }

                        // --- DESATIVAR + RENOMEAR + DESCRIÇÃO ---
                        const currentUAC = parseInt(userData.userAccountControl, 10);
                        const newUAC = currentUAC | 0x0002; 
                        
                        const newDisplay = `Zz ${userData.displayName} Zz`;
                        const newDesc = `Desligado em ${getFormattedDate()}`;

                        const modifications = [
                            new ldap.Change({ 
                                operation: 'replace', 
                                modification: { type: 'userAccountControl', values: [newUAC.toString()] }
                            }),
                            new ldap.Change({ 
                                operation: 'replace', 
                                modification: { type: 'description', values: [newDesc] }
                            }),
                            new ldap.Change({ 
                                operation: 'replace', 
                                modification: { type: 'displayName', values: [newDisplay] }
                            })
                        ];
                        
                        await new Promise((resolveMod, rejectMod) => {
                            client.modify(userData.dn, modifications, (modErr) => {
                                if (modErr) return rejectMod(new Error('Erro ao atualizar atributos: ' + modErr.message));
                                console.log('✅ [SUCESSO] Atributos atualizados.');
                                resolveMod();
                            });
                        });

                        // --- MOVER PARA PASTA DE DESATIVADOS ---
                        const rdn = `CN=${userData.cn}`;
                        const newDN = `${rdn},${DISABLED_OU}`;
                        
                        await new Promise((resolveMove, rejectMove) => {
                            client.modifyDN(userData.dn, newDN, (moveErr) => {
                                if (moveErr) {
                                    console.error(`❌ [ERRO MOVE]`, moveErr.message);
                                    return resolveMove({ warning: 'Usuário desativado e renomeado, mas falha ao mover de pasta.' });
                                }
                                console.log('✨ [SUCESSO] Usuário movido para pasta de desativados.');
                                resolveMove({ success: true });
                            });
                        });

                        client.unbind();
                        console.log('✨ [SUCESSO TOTAL] Processo de desligamento concluído.');
                        resolve({ success: true });

                    } catch (processError) {
                        client.unbind();
                        console.error('❌ [ERRO CRITICO NO PROCESSO]', processError);
                        reject(processError);
                    }
                });

                searchRes.on('error', (err) => {
                    client.unbind();
                    reject(err);
                });
            });
        });
    });
};

// --- EXCLUIR USUÁRIO DEFINITIVO ---
exports.deleteUserByGUID = (username, adminUser, adminPass) => {
    return new Promise((resolve, reject) => {
        console.log(`\n--- 🗑️ INICIANDO EXCLUSÃO DEFINITIVA: ${username} ---`);

        const client = ldap.createClient({
            url: process.env.AD_URL,
            tlsOptions: { rejectUnauthorized: false }
        });

        // 🔑 Usa a credencial dinâmica
        const bindUser = adminUser || process.env.AD_USER;
        const bindPass = adminPass || process.env.AD_PASSWORD;

        client.bind(bindUser, bindPass, (bindErr) => {
            if (bindErr) {
                client.unbind();
                return reject(new Error('Erro de autenticação no AD. Verifique suas permissões.'));
            }

            const searchOptions = {
                filter: `(sAMAccountName=${username})`,
                scope: 'sub',
                attributes: ['distinguishedName']
            };

            client.search(process.env.AD_BASE, searchOptions, (searchErr, searchRes) => {
                if (searchErr) {
                    client.unbind();
                    return reject(new Error('Erro na busca para exclusão.'));
                }

                let targetDN = null;

                searchRes.on('searchEntry', (entry) => {
                    targetDN = entry.objectName.toString();
                });

                searchRes.on('end', () => {
                    if (!targetDN) {
                        client.unbind();
                        console.log('⚠️ Usuário não encontrado no AD (já removido?).');
                        return resolve({ found: false });
                    }

                    client.del(targetDN, (delErr) => {
                        client.unbind();
                        if (delErr) {
                            console.error('❌ Erro ao deletar do AD:', delErr.message);
                            return reject(new Error('Falha ao excluir do AD: ' + delErr.message));
                        }
                        console.log('✅ Usuário excluído do AD com sucesso.');
                        resolve({ found: true, deleted: true });
                    });
                });

                searchRes.on('error', (err) => {
                    client.unbind();
                    reject(err);
                });
            });
        });
    });
};

// --- DELETAR COMPUTADOR ---
exports.deleteComputer = (computerName, adminUser, adminPass) => {
    return new Promise((resolve, reject) => {
        console.log(`\n--- 💻 INICIANDO EXCLUSÃO DE COMPUTADOR: ${computerName} ---`);

        const client = ldap.createClient({
            url: process.env.AD_URL,
            tlsOptions: { rejectUnauthorized: false }
        });

        // 🔑 Usa a credencial dinâmica (Mesma lógica)
        const bindUser = adminUser || process.env.AD_USER;
        const bindPass = adminPass || process.env.AD_PASSWORD;

        client.bind(bindUser, bindPass, (bindErr) => {
            if (bindErr) {
                client.unbind();
                return reject(new Error('Erro de autenticação no AD. Verifique suas permissões.'));
            }

            const searchOptions = {
                filter: `(&(objectClass=computer)(cn=${computerName}))`,
                scope: 'sub',
                attributes: ['distinguishedName']
            };

            client.search(process.env.AD_BASE, searchOptions, (searchErr, searchRes) => {
                if (searchErr) {
                    client.unbind();
                    return reject(new Error('Erro na busca do computador.'));
                }

                let targetDN = null;

                searchRes.on('searchEntry', (entry) => {
                    targetDN = entry.objectName.toString();
                });

                searchRes.on('end', () => {
                    if (!targetDN) {
                        client.unbind();
                        console.log('⚠️ Computador não encontrado no AD.');
                        return resolve({ found: false });
                    }

                    client.del(targetDN, (delErr) => {
                        client.unbind();
                        if (delErr) {
                            console.error('❌ Erro ao deletar computador:', delErr.message);
                            return reject(new Error('Falha ao excluir do AD: ' + delErr.message));
                        }
                        console.log('✅ Computador excluído com sucesso.');
                        resolve({ found: true, deleted: true });
                    });
                });

                searchRes.on('error', (err) => {
                    client.unbind();
                    reject(err);
                });
            });
        });
    });
};