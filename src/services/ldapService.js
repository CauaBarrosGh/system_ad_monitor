const ldap = require('ldapjs');
const { DISABLED_OU } = require('../config/constants');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec); 

// ======================================================================
// Utilidades
// ======================================================================

//Retorna a data atual formatada em pt-BR (DD/MM/AAAA).
function getFormattedDate() {
    const now = new Date();
    return now.toLocaleDateString('pt-BR');
}

// Extrai valor(es) de um atributo de entrada LDAP (compatível com .values / .vals).
function getAttributeValue(attributes, name) {
    const attr = attributes.find(a => a.type.toLowerCase() === name.toLowerCase());
    if (!attr) return null;
    if (attr.values && attr.values.length > 0) return attr.values;
    if (attr.vals && attr.vals.length > 0) return attr.vals;
    return null;
}

// Decodifica strings do AD que vêm com escapes hexadecimais (\c3\a7 → ç)
function decodeADString(str) {
    if (!str) return '';
    try {
        return decodeURIComponent(str.replace(/\\([0-9a-fA-F]{2})/g, '%$1'));
    } catch (e) {
        return str; 
    }
}

// DESBLOQUEAR USUÁRIO
// - Localiza o usuário pelo sAMAccountName
// - Resolve o GUID e usa "magic DN" (<GUID=...>) para evitar issues de rename/move
// - Faz replace de lockoutTime = 0
exports.unlockUserByGUID = (username, adminUser, adminPass) => {
    return new Promise((resolve, reject) => {
        const client = ldap.createClient({
            url: process.env.AD_URL,
            tlsOptions: { rejectUnauthorized: false }
        });

        // Usa a credencial dinâmica recebida ou a padrão do ambiente
        const bindUser = adminUser || process.env.AD_USER;
        const bindPass = adminPass || process.env.AD_PASSWORD;

        // Bind
        client.bind(bindUser, bindPass, (bindErr) => {
            if (bindErr) {
                client.unbind();
                console.error(`[LDAP SERVICE] Erro de Bind: ${bindErr.message}`);
                return reject(new Error('Erro de autenticação no AD. Verifique suas permissões.'));
            }

            // Busca pelo sAMAccountName para obter GUID
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
                    // Captura o construtor de DN para permitir magic DN
                    if (entry.objectName && entry.objectName.constructor) {
                        DNConstructor = entry.objectName.constructor;
                    }
                    // Extrai GUID do usuário
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

                    // 3) Constroi targetDN como <GUID=...> para operar com segurança
                    const magicString = `<GUID=${userGUID}>`;
                    let targetDN;

                    if (DNConstructor) {
                        targetDN = new DNConstructor();
                        targetDN.toString = () => magicString;
                        targetDN.format = () => magicString;
                    } else {
                        targetDN = magicString;
                    }

                    // 4) Modificação: lockoutTime → 0
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

// DESATIVAR USUÁRIO (PROCESSO COMPLETO)
// Passos principais:
// 1) Bind e busca usuário (GUID, DN, grupos, UAC, etc.)
// 2) Remoção de todos os grupos (exceto "Domain Users")
// 3) Desativar conta (UAC), atualizar displayName/description
// 4) Mover para OU de desativados (DISABLED_OU)
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

        const bindUser = adminUser || process.env.AD_USER;
        const bindPass = adminPass || process.env.AD_PASSWORD;

        // Bind
        client.bind(bindUser, bindPass, (bindErr) => {
            if (bindErr) {
                client.unbind();
                return reject(new Error('Erro de autenticação no AD. Verifique suas permissões.'));
            }

            // Busca dados necessários do usuário
            const searchOptions = {
                filter: `(sAMAccountName=${username})`,
                scope: 'sub',
                paged: true,
                sizeLimit: 0,
                attributes: ['dn', 'cn', 'memberOf', 'userAccountControl', 'displayName', 'objectGUID', 'distinguishedName']
            };

            client.search(process.env.AD_BASE, searchOptions, (searchErr, searchRes) => {
                if (searchErr) {
                    client.unbind();
                    return reject(new Error('Erro ao iniciar busca.'));
                }

                let userData = null;

                searchRes.on('searchEntry', (entry) => {
                    // Extrai atributos relevantes (com fallback de métodos)
                    const cnVals = getAttributeValue(entry.attributes, 'cn');
                    const uacVals = getAttributeValue(entry.attributes, 'userAccountControl');
                    const displayVals = getAttributeValue(entry.attributes, 'displayName');
                    const memberOfVals = getAttributeValue(entry.attributes, 'memberOf');
                    const pureDNVals = getAttributeValue(entry.attributes, 'distinguishedName');

                    // DN "cru" (para memberOf) e DN traduzido (para move)
                    const rawDNString = (pureDNVals && pureDNVals.length > 0) ? pureDNVals[0] : entry.objectName.toString();
                    const translatedDNString = entry.objectName.toString();

                    // Resolve GUID do usuário
                    let userGUID = null;
                    const guidAttr = entry.attributes.find(a => a.type.toLowerCase() === 'objectguid');
                    if (guidAttr) {
                        if (guidAttr.buffers && guidAttr.buffers.length > 0) {
                            userGUID = guidAttr.buffers[0].toString('hex');
                        } else if (guidAttr.values && guidAttr.values.length > 0) {
                            userGUID = Buffer.from(guidAttr.values[0], 'binary').toString('hex');
                        }
                    }

                    let DNConstructor = null;
                    if (entry.objectName && entry.objectName.constructor) {
                        DNConstructor = entry.objectName.constructor;
                    }

                    userData = {
                        dnForGroups: rawDNString,          // DN usado para operar 'member' nos grupos
                        dnForMove: translatedDNString,     // DN exibido (pode ser usado em fallback do move)
                        cn: cnVals ? cnVals[0] : '',
                        userAccountControl: uacVals ? uacVals[0] : '512',
                        displayName: displayVals ? displayVals[0] : username,
                        memberOf: memberOfVals || [],
                        guid: userGUID,
                        DNConstructor: DNConstructor        // Mantém construtor para magic DN
                    };
                });

                searchRes.on('end', async () => {
                    if (!userData) {
                        client.unbind();
                        return reject(new Error('Usuário não encontrado na busca.'));
                    }

                    try {
                        //  REMOVER DOS GRUPOS (exceto Domain Users)
                        // - Faz busca do grupo por CN para resgatar GUID
                        // - Usa magicDN do grupo para modificar membership
                        let groups = Array.isArray(userData.memberOf) ? userData.memberOf : [userData.memberOf];
                        groups = groups.filter(g => g);
                        groups.forEach(g => console.log(`  - ${g}`));

                        for (const groupDN of groups) {
                            // Pula o primário "Domain Users" (e variantes)
                            if (groupDN.toLowerCase().includes('domain users') || 
                                groupDN.toLowerCase().includes('usuários do domínio')) {
                                console.log(`⏩ [INFO] Pulando grupo primário: ${groupDN}`);
                                continue;
                            }

                            await new Promise((resolveGroup) => {
                                // Extrai CN do DN do grupo
                                const cnMatch = groupDN.match(/^CN=([^,]+)/);
                                if (!cnMatch) {
                                    return resolveGroup();
                                }
                                
                                const groupCN = cnMatch[1];
                                const groupSearchOptions = {
                                    filter: `(&(objectClass=group)(cn=${groupCN}))`,
                                    scope: 'sub',
                                    attributes: ['objectGUID', 'distinguishedName', 'cn']
                                };
                                
                                client.search(process.env.AD_BASE, groupSearchOptions, (searchErr, searchRes) => {
                                    if (searchErr) return resolveGroup();
                                    
                                    let groupGUID = null;
                                    let groupDNConstructor = null;
                                    
                                    searchRes.on('searchEntry', (entry) => {
                                        // Garante construtor para magic DN
                                        if (entry.objectName && entry.objectName.constructor) {
                                            groupDNConstructor = entry.objectName.constructor;
                                        }
                                        // Extrai GUID do grupo
                                        const guidAttr = entry.attributes.find(a => a.type.toLowerCase() === 'objectguid');
                                        if (guidAttr) {
                                            if (guidAttr.buffers && guidAttr.buffers.length > 0) {
                                                groupGUID = guidAttr.buffers[0].toString('hex');
                                            } else if (guidAttr.values && guidAttr.values.length > 0) {
                                                groupGUID = Buffer.from(guidAttr.values[0], 'binary').toString('hex');
                                            }
                                        }
                                        
                                        if (groupGUID) {
                                            // Constrói magic DN do grupo
                                            const magicString = `<GUID=${groupGUID}>`;
                                            let targetGroupDN;
                                            
                                            if (groupDNConstructor) {
                                                targetGroupDN = new groupDNConstructor();
                                                targetGroupDN.toString = () => magicString;
                                                targetGroupDN.format = () => magicString;
                                            } else {
                                                targetGroupDN = magicString;
                                            }
                                            
                                            // Remove a associação 'member' (userData.dnForGroups)
                                            const change = new ldap.Change({
                                                operation: 'delete',
                                                modification: {
                                                    type: 'member',
                                                    values: [userData.dnForGroups] 
                                                }
                                            });
                                            
                                            client.modify(targetGroupDN, change, (modErr) => {
                                                if (modErr) {
                                                    if (modErr.message.includes('Unwilling') || modErr.message.includes('No Such Object')) {
                                                        console.log(`🗑️ [INFO] Usuário já havia sido removido do grupo.`);
                                                    } else {
                                                        console.log(`⚠️ [AVISO] Falha ao remover: ${modErr.message}`);
                                                    }
                                                } else {
                                                    console.log(`🗑️ [SUCESSO] Removido do grupo: ${groupCN}`);
                                                }
                                                resolveGroup();
                                            });
                                        } else {
                                            resolveGroup();
                                        }
                                    });
                                    searchRes.on('end', () => resolveGroup());
                                    searchRes.on('error', () => resolveGroup());
                                });
                            });
                        }

                        // DESATIVAR + RENOMEAR + DESCRIÇÃO
                        // - Usa GUID/magic DN para evitar falha se o DN mudar
                        let targetUserDN = userData.dnForMove;
                        if (userData.guid) {
                            const magicUserString = `<GUID=${userData.guid}>`;
                            if (userData.DNConstructor) {
                                targetUserDN = new userData.DNConstructor();
                                targetUserDN.toString = () => magicUserString;
                                targetUserDN.format = () => magicUserString;
                            } else {
                                targetUserDN = magicUserString;
                            }
                        }

                        // Ativa bit de desabilitado no UAC e atualiza metadados
                        const currentUAC = parseInt(userData.userAccountControl, 10);
                        const newUAC = currentUAC | 0x0002; // UF_ACCOUNTDISABLE
                        
                        const newDisplay = `Zz ${userData.displayName} Zz`;
                        const newDesc = `Desligado em ${getFormattedDate()}`;

                        const modifications = [
                            new ldap.Change({ operation: 'replace', modification: { type: 'userAccountControl', values: [newUAC.toString()] } }),
                            new ldap.Change({ operation: 'replace', modification: { type: 'description', values: [newDesc] } }),
                            new ldap.Change({ operation: 'replace', modification: { type: 'displayName', values: [newDisplay] } })
                        ];
                        
                        await new Promise((resolveMod, rejectMod) => {
                            client.modify(targetUserDN, modifications, (modErr) => {
                                if (modErr) return rejectMod(new Error('Erro ao atualizar atributos: ' + modErr.message));
                                console.log('✅ [SUCESSO] Atributos atualizados.');
                                resolveMod();
                            });
                        });

                        // MOVER PARA OU DE DESATIVADOS
                        // - Usa modifyDN com "token" para injetar magic DN via DNConstructor
                        // - Fallback direto com dnForMove, se necessário
                        let rdnName = userData.cn.replace(/([\\,=+<>#;"])/g, '\\$1');
                        const newDN = `CN=${rdnName},${DISABLED_OU}`;
                        
                        await new Promise((resolveMove, rejectMove) => {
                            if (userData.DNConstructor && userData.guid) {
                                const DNClass = userData.DNConstructor;
                                const originalFromString = DNClass.fromString;
                                
                                // Monkey-patch controlado para permitir passar um "token" que vira <GUID=...>
                                DNClass.fromString = function(str) {
                                    if (str === 'MAGIC_MOVE_TOKEN') {
                                        const magicObj = new DNClass();
                                        magicObj.toString = () => `<GUID=${userData.guid}>`;
                                        magicObj.format = () => `<GUID=${userData.guid}>`;
                                        return magicObj;
                                    }
                                    return originalFromString.call(this, str);
                                };
                                
                                client.modifyDN('MAGIC_MOVE_TOKEN', newDN, (moveErr) => {
                                    // Restaura comportamento original
                                    DNClass.fromString = originalFromString;
                                    
                                    if (moveErr) {
                                        console.error(`❌ [ERRO MOVE]`, moveErr.message);
                                        return resolveMove({ warning: 'Usuário desativado, mas falha ao mover de pasta.' });
                                    }
                                    console.log('✨ [SUCESSO] Usuário movido para pasta de desativados.');
                                    resolveMove({ success: true });
                                });
                            } else {
                                // Fallback usando DN "visível"
                                client.modifyDN(userData.dnForMove, newDN, (moveErr) => {
                                    if (moveErr) return resolveMove({ warning: 'Falha ao mover.' });
                                    resolveMove({ success: true });
                                });
                            }
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

// EXCLUIR USUÁRIO DEFINITIVO
// - Busca DN pelo sAMAccountName e executa 'del'
// - Sem árvore (objeto não deve conter filhos)
exports.deleteUserByGUID = (username, adminUser, adminPass) => {
    return new Promise((resolve, reject) => {
        console.log(`\n--- 🗑️ INICIANDO EXCLUSÃO DEFINITIVA: ${username} ---`);

        const client = ldap.createClient({
            url: process.env.AD_URL,
            tlsOptions: { rejectUnauthorized: false }
        });

        const bindUser = adminUser || process.env.AD_USER;
        const bindPass = adminPass || process.env.AD_PASSWORD;

        // Bind
        client.bind(bindUser, bindPass, (bindErr) => {
            if (bindErr) {
                client.unbind();
                return reject(new Error('Erro de autenticação no AD. Verifique suas permissões.'));
            }

            // Busca DN do usuário
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

                    // Deleta o objeto
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

// EXCLUIR COMPUTADOR
// - Busca CN=... com objectClass=computer e executa Tree Delete control
// - Permite deletar objetos com filhos (ex.: BitLocker Keys)
exports.deleteComputer = (computerName, adminUser, adminPass) => {
    return new Promise((resolve, reject) => {
        console.log(`\n--- 💻 INICIANDO EXCLUSÃO DE COMPUTADOR: ${computerName} ---`);

        const client = ldap.createClient({
            url: process.env.AD_URL,
            tlsOptions: { rejectUnauthorized: false }
        });

        const bindUser = adminUser || process.env.AD_USER;
        const bindPass = adminPass || process.env.AD_PASSWORD;

        // Bind
        client.bind(bindUser, bindPass, (bindErr) => {
            if (bindErr) {
                client.unbind();
                return reject(new Error('Erro de autenticação no AD. Verifique suas permissões.'));
            }

            // Busca DN do computador
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

                    // Tree Delete Control (OID 1.2.840.113556.1.4.805) para excluir objetos com filhos
                    const treeDeleteControl = new ldap.Control({
                        type: '1.2.840.113556.1.4.805', 
                        criticality: true
                    });

                    client.del(targetDN, [treeDeleteControl], (delErr) => {
                        client.unbind();
                        
                        if (delErr) {
                            console.error('❌ Erro ao deletar computador:', delErr.message);
                            return reject(new Error('Falha ao excluir do AD: ' + delErr.message));
                        }
                        
                        console.log('✅ Computador excluído com sucesso (Tree Delete).');
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

// VERIFICAR SE USUÁRIO EXISTE
// - Busca sAMAccountName e retorna booleano
exports.checkUserExists = (username, adminUser, adminPass) => {
    return new Promise((resolve, reject) => {
        const client = ldap.createClient({
            url: process.env.AD_URL,
            tlsOptions: { rejectUnauthorized: false }
        });

        const bindUser = adminUser || process.env.AD_USER;
        const bindPass = adminPass || process.env.AD_PASSWORD;

        client.bind(bindUser, bindPass, (bindErr) => {
            if (bindErr) {
                client.unbind();
                return reject(new Error(`Erro de autenticação ao consultar AD: ${bindErr.message}`));
            }

            const searchOptions = {
                filter: `(sAMAccountName=${username})`,
                scope: 'sub',
                attributes: ['sAMAccountName']
            };

            client.search(process.env.AD_BASE, searchOptions, (searchErr, searchRes) => {
                if (searchErr) {
                    client.unbind();
                    return reject(new Error('Erro ao buscar usuário no AD.'));
                }

                let exists = false;
                searchRes.on('searchEntry', () => { exists = true; });
                searchRes.on('end', () => {
                    client.unbind();
                    resolve(exists);
                });
                searchRes.on('error', (err) => {
                    client.unbind();
                    reject(err);
                });
            });
        });
    });
};

// CRIAR NOVO USUÁRIO (PROCESSO COMPLETO)
// - Cria via PowerShell (DirectoryServices) por robustez em senha/UAC
// - Depois, adiciona o usuário aos grupos via LDAP (usando GUID do grupo)
// - Suporta forcePwdChange, jobTitle->description, seniority->departmentNumber
exports.createNewUserFullProcess = (userData, targetOU, targetGroups, adminUser, adminPass) => {
    return new Promise(async (resolve, reject) => {
        const client = ldap.createClient({
            url: process.env.AD_URL,
            tlsOptions: { rejectUnauthorized: false }
        });

        const bindUser = adminUser || process.env.AD_USER;
        const bindPass = adminPass || process.env.AD_PASSWORD;

        // Monta DN do novo usuário e metadado de externo (PJ)
        const rdnName = `${userData.firstName} ${userData.lastName}`.replace(/([\\,=+<>#;"])/g, '\\$1');
        const newUserDN = `CN=${rdnName},${targetOU}`;
        const isExterno = userData.contractType === 'PJ' ? 'TRUE' : 'FALSE';

        try {
            console.log(`⏳ [SERVICE] Criando conta via PowerShell usando credencial: ${bindUser}`);

            // Comandos condicionais no PS (senha expira ao logar, descrição, senioridade)
            const pwdLastSetCommand = userData.forcePwdChange ? '$userEntry.put("pwdLastSet", 0)' : '';
            const descCmd = userData.jobTitle ? `$newUser.Put("description", "${userData.jobTitle.replace(/"/g, '""')}")` : '';
            const deptCmd = userData.seniority ? `$newUser.Put("departmentNumber", "${userData.seniority.replace(/"/g, '""')}")` : '';

            // Script PowerShell (DirectoryServices) para criar user + senha + UAC
            const psScript = `
                $ProgressPreference = 'SilentlyContinue'
                try {
                    $ouDN = "LDAP://${targetOU.replace(/"/g, '""')}"
                    $userDN = "LDAP://${newUserDN.replace(/"/g, '""')}"
                    
                    # Usa a credencial dinâmica aqui!
                    $bindU = "${bindUser.replace(/"/g, '""')}"
                    $bindP = "${bindPass.replace(/"/g, '""')}"

                    # 1. Conecta na OU
                    $ouEntry = New-Object System.DirectoryServices.DirectoryEntry($ouDN, $bindU, $bindP)

                    # 2. Cria a casca do usuário
                    $newUser = $ouEntry.Children.Add("CN=${rdnName.replace(/"/g, '""')}", "user")
                    $newUser.Put("sAMAccountName", "${userData.logonName}")
                    $newUser.Put("userPrincipalName", "${userData.logonName}@soc.com.br")
                    $newUser.Put("givenName", "${userData.firstName}")
                    $newUser.Put("sn", "${userData.lastName}")
                    $newUser.Put("displayName", "${userData.firstName} ${userData.lastName}")
                    ${descCmd}
                    ${deptCmd}
                    $newUser.Put("colaborador", "TRUE")
                    $newUser.Put("colaboradorexterno", "${isExterno}")
                    $newUser.SetInfo()

                    # 3. Reconecta e injeta a Senha
                    $userEntry = New-Object System.DirectoryServices.DirectoryEntry($userDN, $bindU, $bindP)
                    $userEntry.SetPassword('${userData.password.replace(/'/g, "''")}')
                    $userEntry.put("userAccountControl", 512)
                    ${pwdLastSetCommand}
                    $userEntry.SetInfo()

                    Write-Output "PS_SUCCESS"
                } catch {
                    Write-Error $_.Exception.Message
                }
            `;

            // Encoda o script em base64 para execução segura
            const base64Script = Buffer.from(psScript, 'utf16le').toString('base64');
            const { stdout, stderr } = await execPromise(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${base64Script}`);

            if (!stdout.includes('PS_SUCCESS') && stderr && stderr.trim() !== '') {
                throw new Error(`Falha no Active Directory (PowerShell): ${stderr}`);
            }
            console.log('✅ [SUCESSO] Conta criada e ativada.');

            // Rebind para operar nos grupos via LDAP
            await new Promise((resolveBind, rejectBind) => {
                client.bind(bindUser, bindPass, (err) => {
                    if (err) rejectBind(new Error('Erro de autenticação no AD para inserção nos grupos.'));
                    resolveBind();
                });
            });

            // Adiciona o novo usuário em cada grupo alvo
            for (const groupDN of targetGroups) {
                await new Promise((resolveGroup) => {
                    const cnMatch = groupDN.match(/^CN=([^,]+)/);
                    if (!cnMatch) return resolveGroup();

                    const groupCN = cnMatch[1];
                    const groupSearchOptions = {
                        filter: `(&(objectClass=group)(cn=${groupCN}))`,
                        scope: 'sub',
                        attributes: ['objectGUID', 'distinguishedName', 'cn']
                    };

                    client.search(process.env.AD_BASE, groupSearchOptions, (searchErr, searchRes) => {
                        if (searchErr) return resolveGroup();
                        let groupGUID = null;
                        let groupDNConstructor = null;

                        searchRes.on('searchEntry', (entry) => {
                            if (entry.objectName && entry.objectName.constructor) {
                                groupDNConstructor = entry.objectName.constructor;
                            }
                            const guidAttr = entry.attributes.find(a => a.type.toLowerCase() === 'objectguid');
                            if (guidAttr) {
                                if (guidAttr.buffers && guidAttr.buffers.length > 0) {
                                    groupGUID = guidAttr.buffers[0].toString('hex');
                                } else if (guidAttr.values && guidAttr.values.length > 0) {
                                    groupGUID = Buffer.from(guidAttr.values[0], 'binary').toString('hex');
                                }
                            }
                        });

                        searchRes.on('end', () => {
                            if (!groupGUID) return resolveGroup();
                            const magicString = `<GUID=${groupGUID}>`;
                            let targetGroupDN;
                            if (groupDNConstructor) {
                                targetGroupDN = new groupDNConstructor();
                                targetGroupDN.toString = () => magicString;
                                targetGroupDN.format = () => magicString;
                            } else {
                                targetGroupDN = magicString;
                            }

                            // Adiciona 'member' = DN do novo usuário
                            const change = new ldap.Change({
                                operation: 'add',
                                modification: { type: 'member', values: [newUserDN] }
                            });

                            client.modify(targetGroupDN, change, (modErr) => {
                                if (modErr) {
                                    if (modErr.message.includes('Entry Already Exists') || modErr.message.includes('Already exists')) {
                                        console.log(`✅ [SUCESSO] Já estava no grupo: ${groupCN}`);
                                    } else {
                                        console.log(`⚠️ [AVISO] Falha ao incluir no grupo ${groupCN}: ${modErr.message}`);
                                    }
                                } else {
                                    console.log(`✅ [SUCESSO] Inserido no grupo: ${groupCN}`);
                                }
                                resolveGroup();
                            });
                        });
                        searchRes.on('error', () => resolveGroup());
                    });
                });
            }

            client.unbind();
            console.log('✨ [SUCESSO TOTAL] Processo 100% finalizado e auditado!');
            resolve({ success: true });

        } catch (processError) {
            client.unbind();
            console.error('❌ [ERRO CRÍTICO NA CRIAÇÃO]', processError);
            reject(processError);
        }
    });
};

// SINCRONIZAR GRUPOS (via GUID) — Função interna de suporte
// - Normaliza strings para tratar variações (ex.: ç vs \c3\a7)
// - Calcula diff (toAdd / toRemove) e aplica por GUID (robustez)
const syncGroups = async (client, userGUID, currentGroups, targetGroups) => {
    
    // Normalização para comparação (ç e \c3\a7 viram a mesma coisa)
    const normalize = (dn) => {
        if (!dn) return '';
        return dn.toLowerCase()
            .replace(/\\([0-9a-fA-F]{2})/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
            .trim();
    };

    const normTarget = targetGroups.map(g => normalize(g));
    const normCurrent = currentGroups.map(g => normalize(g));

    // Identifica o que realmente mudou
    const toAdd = targetGroups.filter(g => !normCurrent.includes(normalize(g)));
    const toRemove = currentGroups.filter(g => {
        const n = normalize(g);
        return !normTarget.includes(n) && !n.includes('domain users') && !n.includes('usuários do domínio');
    });

    console.log(`📊 [SYNC GROUPS] Localizado: +${toAdd.length} para adicionar | -${toRemove.length} para remover`);

    // Magic DN do usuário por GUID (evita problemas se DN mudar)
    const userMagicDN = `<GUID=${userGUID}>`;

    // Helper: altera associação do usuário em um grupo (add/delete) usando GUID do grupo
    const modifyGroupMembership = async (groupDN, action) => {
        // Extrai o CN da string (seja DN completo ou somente "CN=...")
        const cnMatch = groupDN.match(/CN=([^,]+)/i);
        if (!cnMatch) return;

        // CN "limpo" para a consulta
        const groupCN = decodeADString(cnMatch[1]); 

        return new Promise((resolve) => {
            // Busca GUID do grupo por CN
            client.search(process.env.AD_BASE, {
                filter: `(&(objectClass=group)(cn=${groupCN}))`, 
                scope: 'sub',
                attributes: ['objectGUID']
            }, (err, res) => {
                if (err) {
                    console.error(`❌ Erro na busca do grupo ${groupCN}:`, err.message);
                    return resolve();
                }
                
                let groupGUID = null;
                let Constructor = null;

                res.on('searchEntry', (entry) => {
                    Constructor = entry.objectName.constructor;
                    const guidAttr = entry.attributes.find(a => a.type.toLowerCase() === 'objectguid');
                    groupGUID = guidAttr.buffers ? guidAttr.buffers[0].toString('hex') : Buffer.from(guidAttr.values[0], 'binary').toString('hex');
                });

                res.on('end', () => {
                    if (!groupGUID) {
                        console.error(`❌ Grupo não encontrado via CN: ${groupCN}`);
                        return resolve();
                    }

                    // Magic DN do grupo por GUID
                    const groupMagicDN = new Constructor();
                    groupMagicDN.toString = () => `<GUID=${groupGUID}>`;

                    const change = new ldap.Change({
                        operation: action,
                        modification: { 
                            type: 'member', 
                            values: [userMagicDN] 
                        }
                    });

                    client.modify(groupMagicDN, change, (modErr) => {
                        if (modErr) {
                            console.error(`⚠️ Erro ao ${action} membro no grupo ${groupCN}:`, modErr.message);
                        } else {
                            console.log(`✅ [${action.toUpperCase()}] Grupo: ${groupCN} (via GUID)`);
                        }
                        resolve();
                    });
                });
            });
        });
    };

    // Executa as remoções primeiro (boa prática)
    for (const g of toRemove) await modifyGroupMembership(g, 'delete');
    // Depois, as adições
    for (const g of toAdd) await modifyGroupMembership(g, 'add');
};

// EDITAR USUÁRIO (ATRIBUTOS + GRUPOS + MOVE OU)
// - Busca GUID/DN do usuário
// - Modifica atributos por magic DN (GUID)
// - Sincroniza grupos (via syncGroups)
// - Fecha LDAP e move OU via PowerShell (DirectoryServices) com busca interna
exports.updateUserFull = (username, data, adminUser, adminPass) => {
    return new Promise(async (resolve, reject) => {
        const client = ldap.createClient({ 
            url: process.env.AD_URL, 
            tlsOptions: { rejectUnauthorized: false } 
        });

        const bindUser = adminUser || process.env.AD_USER;
        const bindPass = adminPass || process.env.AD_PASSWORD;

        // Bind
        client.bind(bindUser, bindPass, async (bindErr) => {
            if (bindErr) {
                client.unbind();
                return reject(new Error('Erro de autenticação no AD.'));
            }

            try {
                // Busca o usuário (GUID, DN atual, grupos)
                const user = await new Promise((res, rej) => {
                    const opts = { filter: `(sAMAccountName=${username})`, scope: 'sub', attributes: ['objectGUID', 'distinguishedName', 'memberOf'] };
                    client.search(process.env.AD_BASE, opts, (err, sRes) => {
                        if (err) return rej(err);
                        let found = null;
                        sRes.on('searchEntry', e => {
                            const guidAttr = e.attributes.find(a => a.type.toLowerCase() === 'objectguid');
                            found = {
                                dn: e.objectName.toString(),
                                guid: guidAttr.buffers ? guidAttr.buffers[0].toString('hex') : Buffer.from(guidAttr.values[0], 'binary').toString('hex'),
                                groups: getAttributeValue(e.attributes, 'memberOf') || [],
                                DNConstructor: e.objectName.constructor
                            };
                        });
                        sRes.on('end', () => res(found));
                    });
                });

                if (!user) throw new Error('Usuário não encontrado.');

                // Modifica atributos e grupos via magic DN (<GUID=...>)
                const magicUserDN = new user.DNConstructor();
                magicUserDN.toString = () => `<GUID=${user.guid}>`;
                magicUserDN.format = () => `<GUID=${user.guid}>`;

                const mods = [];
                if (data.displayName) mods.push(new ldap.Change({ operation: 'replace', modification: { type: 'displayName', values: [data.displayName] } }));
                if (data.description) mods.push(new ldap.Change({ operation: 'replace', modification: { type: 'description', values: [data.description] } }));
                if (data.departmentNumber) mods.push(new ldap.Change({ operation: 'replace', modification: { type: 'departmentNumber', values: [data.departmentNumber] } }));

                if (mods.length > 0) {
                    await new Promise((res, rej) => client.modify(magicUserDN, mods, err => err ? rej(err) : res()));
                }
                if (data.targetGroups) {
                    await syncGroups(client, user.guid, user.groups, data.targetGroups);
                }

                // Fecha LDAP antes do PowerShell (evita locks no objeto)
                client.unbind();
                console.log(`🔒 Conexão LDAP encerrada para ${username}. Iniciando movimentação...`);

                // Move de OU via PowerShell (busca interna por sAMAccountName)
                if (data.targetOU) {
                    const currentDN = user.dn.toLowerCase();
                    const targetOUPath = data.targetOU.toLowerCase().trim();

                    // Move apenas se ainda não estiver na OU destino
                    if (!currentDN.includes(targetOUPath)) {
                        console.log(`🚀 [POWERSHELL] Movendo ${username} via Busca Interna (Base64)...`);

                        const ouBase64 = Buffer.from(data.targetOU, 'utf8').toString('base64');

                        const psScript = `
                            $ProgressPreference = 'SilentlyContinue'
                            try {
                                # Decodifica o caminho da OU
                                $ouB64 = "${ouBase64}"
                                $ouPath = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($ouB64))
                                
                                # Credenciais
                                $u = "${bindUser.replace(/"/g, '""')}"
                                $p = "${bindPass.replace(/"/g, '""')}"
                                $base = "LDAP://${process.env.AD_BASE}"

                                # 1. Localiza o usuário dentro do PowerShell (Garante objeto fresco e com permissão)
                                $searcher = New-Object System.DirectoryServices.DirectorySearcher([ADSI]"$base")
                                $searcher.Filter = "(sAMAccountName=${username})"
                                $userResult = $searcher.FindOne()
                                
                                if ($userResult -eq $null) { throw "Usuário ${username} não localizado no AD pelo PowerShell." }

                                # 2. Abre os objetos com credenciais explícitas
                                $userEntry = New-Object System.DirectoryServices.DirectoryEntry($userResult.Path, $u, $p)
                                $targetOU = New-Object System.DirectoryServices.DirectoryEntry("LDAP://$ouPath", $u, $p)

                                # 3. Executa a movimentação
                                $userEntry.psbase.MoveTo($targetOU)
                                
                                Write-Output "PS_MOVE_SUCCESS"
                            } catch {
                                Write-Error $_.Exception.Message
                            }
                        `;

                        const base64Script = Buffer.from(psScript, 'utf16le').toString('base64');
                        const { stdout, stderr } = await execPromise(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${base64Script}`);

                        if (!stdout.includes('PS_MOVE_SUCCESS')) {
                            console.error(`❌ Erro MoveTo: ${stderr}`);
                        } else {
                            console.log('✨ [SUCESSO] Usuário movido de OU com busca interna.');
                        }
                    }
                }

                resolve({ success: true });

            } catch (e) {
                console.error(`❌ Erro no Processo: ${e.message}`);
                if (client) client.unbind();
                reject(e);
            }
        });
    });
};

// BUSCAR DETALHES COMPLETOS DO USUÁRIO
// - Retorna displayName, description, department, departmentNumber,
//   manager, memberOf e DN.
exports.getUserDetails = (username, adminUser, adminPass) => {
    return new Promise((resolve, reject) => {
        const client = ldap.createClient({ url: process.env.AD_URL, tlsOptions: { rejectUnauthorized: false } });
        const bindUser = adminUser || process.env.AD_USER;
        const bindPass = adminPass || process.env.AD_PASSWORD;

        client.bind(bindUser, bindPass, (err) => {
            if (err) {
                client.unbind();
                return reject(err);
            }
            const opts = {
                filter: `(sAMAccountName=${username})`,
                scope: 'sub',
                attributes: ['displayName', 'description', 'department', 'departmentNumber', 'manager', 'memberOf']
            };
            client.search(process.env.AD_BASE, opts, (sErr, sRes) => {
                if (sErr) {
                    client.unbind();
                    return reject(sErr);
                }
                let found = null;
                sRes.on('searchEntry', (entry) => {
                    const disp = getAttributeValue(entry.attributes, 'displayName');
                    const desc = getAttributeValue(entry.attributes, 'description');
                    const dept = getAttributeValue(entry.attributes, 'department');
                    const dnum = getAttributeValue(entry.attributes, 'departmentNumber');
                    const mgr = getAttributeValue(entry.attributes, 'manager');
                    const groups = getAttributeValue(entry.attributes, 'memberOf');

                    found = {
                        displayName: (disp && disp[0]) || '',
                        description: (desc && desc[0]) || '',
                        department: (dept && dept[0]) || '',
                        departmentNumber: (dnum && dnum[0]) || '',
                        manager: (mgr && mgr[0]) || '',
                        groups: groups || [],
                        dn: entry.objectName.toString()
                    };
                });
                sRes.on('end', () => {
                    client.unbind();
                    resolve(found);
                });
                sRes.on('error', (e) => {
                    client.unbind();
                    reject(e);
                });
            });
        });
    });
};

// LISTAR TODOS OS GRUPOS DO AD (para seletores da UI)
// - Retorna {dn, cn} ordenados alfabeticamente
exports.getAllADGroups = (adminUser, adminPass) => {
    return new Promise((resolve, reject) => {
        const client = ldap.createClient({ url: process.env.AD_URL, tlsOptions: { rejectUnauthorized: false } });
        
        client.bind(adminUser, adminPass, (err) => {
            if (err) return reject(err);

            const opts = {
                filter: '(objectClass=group)',
                scope: 'sub',
                attributes: ['distinguishedName', 'cn']
            };

            client.search(process.env.AD_BASE, opts, (sErr, sRes) => {
                if (sErr) return reject(sErr);
                
                const groups = [];
                sRes.on('searchEntry', (entry) => {
                    groups.push({
                        dn: entry.objectName.toString(),
                        cn: entry.attributes.find(a => a.type.toLowerCase() === 'cn')?.values[0] || 'Sem Nome'
                    });
                });

                sRes.on('end', () => {
                    client.unbind();
                    // Ordena alfabeticamente para o seletor ficar organizado
                    resolve(groups.sort((a, b) => a.cn.localeCompare(b.cn)));
                });
                
                sRes.on('error', (e) => { client.unbind(); reject(e); });
            });
        });
    });
};
