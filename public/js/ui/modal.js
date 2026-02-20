import { store } from "../state/store.js";            
import { ROLE_COLORS } from "../config/roleColors.js"; 
import { calcTimeInCompany, formatDate, getRoleBadge } from "../utils/format.js"; 
import { unlockUserAccount, confirmDisable } from "../features/userActions.js";    
import { refreshAfterUserAction } from "../features/sectionLoader.js";                         

// Mapeamento de "Perfil/Setor" para grupos padrão e OU destino no AD.
// Usado quando o usuário altera o campo "Perfil/Setor" no modo de edição.
const PERFIL_MAP = {
    'TI': { 
        groups: ['CN=Dev - TI,OU=Grupos de Segurança,OU=SOC,DC=soc,DC=com,DC=br', 'CN=SocTodos,OU=Grupos de Segurança,OU=SOC,DC=soc,DC=com,DC=br'],
        targetOU: 'OU=Teste_Caua,DC=soc,DC=com,DC=br'
    },
    'GSI': { 
        groups: ['CN=DEV - Gestão de Sistemas Internos,OU=Grupos de Segurança,OU=SOC,DC=soc,DC=com,DC=br', 'CN=SocTodos,OU=Grupos de Segurança,OU=SOC,DC=soc,DC=com,DC=br'],
        targetOU: 'OU=Engenharia,OU=Operações,OU=Operação e Tecnologia,OU=Usuarios,OU=SOC,DC=soc,DC=com,DC=br'
    },
    'SI': { 
        groups: ['CN=SocTodos,OU=Grupos de Segurança,OU=SOC,DC=soc,DC=com,DC=br'], 
        targetOU: 'OU=Usuarios,OU=SOC,DC=soc,DC=com,DC=br' 
    },
    'COMERCIAL': { 
        groups: ['CN=SocTodos,OU=Grupos de Segurança,OU=SOC,DC=soc,DC=com,DC=br'], 
        targetOU: 'OU=Usuarios,OU=SOC,DC=soc,DC=com,DC=br' 
    },
    'RH': { 
        groups: ['CN=SocTodos,OU=Grupos de Segurança,OU=SOC,DC=soc,DC=com,DC=br'], 
        targetOU: 'OU=Usuarios,OU=SOC,DC=soc,DC=com,DC=br' 
    }
};


// Decodifica strings do AD que vêm com escapes hexadecimais (\c3\a7 → ç).
// Evita exibir nomes/OU com caracteres quebrados.
function decodeADString(str) {
    if (!str) return '';
    try {
        return decodeURIComponent(str.replace(/\\([0-9a-fA-F]{2})/g, '%$1'));
    } catch (e) {
        return str; 
    }
}

// ======================================================================
// Abre o modal de usuário, carrega detalhes do AD e renderiza:
// - Modo de visualização (dados, grupos, OU)
// - Modo de edição (campos editáveis, seleção de grupos, perfil/OU)
// Integra com ações (desbloquear, desativar) e persistência (PUT).
// ======================================================================
export async function openUserModal(username) {
    const userStore = store.globalUsers.find((u) => u.username === username);
    if (!userStore) return;

    const modal = document.getElementById('userModal');
    const content = document.getElementById('modalContent');
    const body = document.getElementById('modalBody');
    const footer = document.getElementById('modalFooter');

    // Estado inicial de carregamento visual
    body.innerHTML = `
        <div class="col-span-2 flex flex-col items-center justify-center py-20 gap-4">
            <i data-lucide="loader-2" class="animate-spin h-10 w-10 text-blue-500"></i>
            <p class="text-sm font-bold text-slate-500 uppercase tracking-widest">Consultando AD...</p>
        </div>`;
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide) lucide.createIcons();

    try {
        const [userRes, groupsRes] = await Promise.all([
            fetch(`/api/users/${username}/details`),
            fetch('/api/groups') 
        ]);

        const adData = await userRes.json();
        let allADGroups = await groupsRes.json();

        // Garante que a lista de grupos seja um array válido
        if (!Array.isArray(allADGroups)) {
            allADGroups = []; 
        }

        const details = adData.details;

        // ==============================================================
        // MODO VISUALIZAÇÃO
        // Mostra informações do colaborador: nome, email, cargo, status,
        // tempo de empresa, último logon, OU e chips dos grupos.
        // ==============================================================
        const renderViewMode = () => {
            const c = ROLE_COLORS[userStore.role] || ROLE_COLORS.COLABORADOR;
            const timeStr = calcTimeInCompany(userStore.data_inicio);
            const ouRaw = details.dn ? details.dn.split(',').slice(1).join(',') : '-';
            const ouClean = decodeADString(ouRaw);
            const managerClean = details.manager ? details.manager.match(/CN=([^,]+)/)?.[1] : 'Não definido';
            
            const groupsHtml = details.groups.map(g => {
                const cn = g.match(/CN=([^,]+)/i)?.[1] || g;
                const cleanCN = decodeADString(cn);
                return `<span class="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-bold px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 mr-2 mb-2">${cleanCN}</span>`;
            }).join('');

            // Cabeçalho e colunas de informações
            body.innerHTML = `
                <div class="col-span-2 flex items-center gap-5 mb-4">
                    <div class="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold border-2" style="background-color: ${c.bg}; color: ${c.text}; border-color: ${c.bg}">
                        ${details.displayName.charAt(0)}
                    </div>
                    <div>
                        <h2 class="text-2xl font-bold text-slate-800 dark:text-white">${details.displayName}</h2>
                        <p class="text-sm text-slate-500 font-mono">${userStore.email || username + '@soc.com.br'}</p>
                        <div class="mt-1">${getRoleBadge(userStore.role)}</div>
                    </div>
                </div>

                <div class="space-y-4">
                    <div><p class="text-xs font-bold text-slate-400 uppercase">Descrição</p><p class="text-sm text-slate-700 dark:text-slate-300 font-medium">${details.description || '-'}</p></div>
                    <div><p class="text-xs font-bold text-slate-400 uppercase">Departamento</p><p class="text-sm text-slate-700 dark:text-slate-300 font-medium">${details.department || '-'}</p></div>
                    <div><p class="text-xs font-bold text-slate-400 uppercase">Senioridade</p><p class="text-sm text-slate-700 dark:text-slate-300 font-medium">${details.departmentNumber || '-'}</p></div>
                    <div><p class="text-xs font-bold text-slate-400 uppercase">Gestor</p><p class="text-sm text-slate-700 dark:text-slate-300 font-medium">${managerClean}</p></div>
                </div>

                <div class="space-y-4">
                    <div><p class="text-xs font-bold text-slate-400 uppercase">Status</p><p class="text-sm ${userStore.is_enabled ? 'text-green-600' : 'text-red-500'} font-bold">${userStore.is_enabled ? '✅ ATIVO' : '⛔ DESATIVADO'}</p></div>
                    <div><p class="text-xs font-bold text-slate-400 uppercase">Tempo de Empresa</p><p class="text-sm text-slate-700 dark:text-slate-300 font-medium">${timeStr}</p></div>
                    <div><p class="text-xs font-bold text-slate-400 uppercase">Último Logon</p><p class="text-sm text-slate-700 dark:text-slate-300 font-medium">${formatDate(userStore.last_logon)}</p></div>
                    <div><p class="text-xs font-bold text-slate-400 uppercase">Unidade Organizacional (OU)</p><p class="text-[11px] text-slate-600 dark:text-slate-400 font-mono break-all leading-tight">${ouClean}</p></div>
                </div>

                <div class="col-span-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <p class="text-xs font-bold text-slate-400 uppercase mb-3">Membro dos Grupos</p>
                    <div class="flex flex-wrap max-h-28 overflow-y-auto custom-scrollbar">
                        ${groupsHtml || '<p class="text-xs italic text-slate-400">Sem grupos</p>'}
                    </div>
                </div>
            `;

            // Botões de ação (editar, desbloquear, desativar)
            footer.innerHTML = `
                <div class="flex items-center space-x-2">
                    <button id="btn-edit" class="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500 hover:text-blue-500 transition shadow-sm"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
                    <button id="btn-unlock" class="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-blue-500 hover:bg-blue-100 transition shadow-sm" title="Desbloquear"><i data-lucide="lock-open" class="w-4 h-4"></i></button>
                    <button id="btn-disable" class="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-red-500 hover:bg-red-100 transition shadow-sm" title="Desativar"><i data-lucide="user-x" class="w-4 h-4"></i></button>
                </div>
            `;

            // Handlers do modo visualização
            footer.querySelector('#btn-edit').onclick = () => enterEditMode(username, details);
            footer.querySelector('#btn-unlock').onclick = () => unlockUserAccount(username);
            footer.querySelector('#btn-disable').onclick = () => confirmDisable(username, details.displayName);
            if (window.lucide) lucide.createIcons();
        };

        // ==============================================================
        // MODO EDIÇÃO
        // Permite editar displayName, descrição, senioridade e gerenciar
        // grupos via seletor com busca + multi-seleção (SweetAlert).
        // O campo OU é preenchido automaticamente ao trocar de Perfil/Setor.
        // ==============================================================
        const enterEditMode = (username, current) => {
            let selectedGroups = [...current.groups];

            // ------------------------------
            // Atualiza a UI dos chips/grupos
            // ------------------------------
            const updateGroupsUI = () => {
                const container = document.getElementById('edit-groups-container');
                if (!container) return;

                const chipsHtml = selectedGroups.map((g, index) => {
                    const cn = g.match(/CN=([^,]+)/i)?.[1] || g;
                    const cleanCN = decodeADString(cn);
                    
                    // Marca visualmente grupos "novos" (não pertenciam ao AD do usuário)
                    const isNew = !current.groups.includes(g);
                    const colorClasses = isNew 
                        ? "bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800/50" 
                        : "bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-800/50";

                    return `
                        <div class="flex items-center gap-1 ${colorClasses} text-[10px] font-bold px-2 py-1 rounded border mr-2 mb-2 group">
                            <span>${cleanCN}</span>
                            <button type="button" class="btn-remove-group hover:text-red-500 opacity-60 group-hover:opacity-100 transition" data-index="${index}">
                                <i data-lucide="x" class="w-3 h-3"></i>
                            </button>
                        </div>`;
                }).join('');

                // Botão para adicionar novos grupos via modal seletor
                container.innerHTML = `
                    ${chipsHtml}
                    <button type="button" id="trigger-group-selector" class="flex items-center gap-1 bg-slate-200 dark:bg-slate-800 text-slate-500 hover:bg-blue-600 hover:text-white text-[10px] font-bold px-3 py-1 rounded border border-dashed border-slate-400 dark:border-slate-700 transition-all mb-2">
                        <i data-lucide="plus" class="w-3 h-3"></i> ADICIONAR GRUPO
                    </button>
                `;
                
                // Remoção de grupos individuais
                container.querySelectorAll('.btn-remove-group').forEach(btn => {
                    btn.onclick = (e) => {
                        selectedGroups.splice(e.currentTarget.dataset.index, 1);
                        updateGroupsUI();
                    };
                });

                // Abre o seletor de grupos
                document.getElementById('trigger-group-selector').onclick = showGroupSelector;
                if (window.lucide) lucide.createIcons();
            };

            // ----------------------------------------------------------
            // Seletor de grupos (SweetAlert):
            // - Busca por texto
            // - Seleção múltipla com feedback visual
            // - Evita escolher grupos já aplicados no grid principal
            // ----------------------------------------------------------
            const showGroupSelector = async () => {
            // Set temporário para armazenar o que for clicado no modal
            let tempSelected = new Set();

            const { value: confirmedGroups } = await Swal.fire({
                title: 'Selecionar Grupos',
                background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
                color: document.documentElement.classList.contains('dark') ? '#f1f5f9' : '#1e293b',
                html: `
                    <div class="p-1">
                        <input type="text" id="swal-search-groups" 
                            class="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:ring-2 focus:ring-blue-500" 
                            placeholder="Pesquisar grupos (ex: TI, Gestão...)" autocomplete="off">
                        
                        <div id="swal-groups-list" class="max-h-[350px] overflow-y-auto custom-scrollbar flex flex-col gap-1 text-left">
                            ${allADGroups.map(g => {
                                // Desabilita seleção de grupos já presentes no grid principal
                                const isAlreadySelected = selectedGroups.includes(g.dn);
                                return `
                                    <button class="group-opt w-full px-3 py-2 text-[11px] rounded transition-all text-left font-medium border ${isAlreadySelected ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-800' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}" 
                                        data-dn="${g.dn}" 
                                        data-cn="${g.cn}"
                                        ${isAlreadySelected ? 'disabled' : ''}>
                                        <div class="flex items-center justify-between">
                                            <span>${decodeADString(g.cn)}</span>
                                            <i data-lucide="check" class="w-3 h-3 text-blue-500 hidden check-icon"></i>
                                        </div>
                                    </button>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `,
                showCancelButton: true,
                heightAuto: false, 
                scrollbarPadding: false,
                confirmButtonText: 'Confirmar Seleção',
                confirmButtonColor: '#2563eb',
                cancelButtonText: 'Cancelar',
                // Retorna a seleção ao confirmar
                preConfirm: () => {
                    return Array.from(tempSelected);
                },
                didOpen: () => {
                    const searchInput = document.getElementById('swal-search-groups');
                    const list = document.getElementById('swal-groups-list');
                    const options = list.querySelectorAll('.group-opt:not([disabled])');

                    if (window.lucide) lucide.createIcons();
                    searchInput.focus();

                    // Filtro por termo digitado (match no CN)
                    searchInput.oninput = (e) => {
                        const term = e.target.value.toLowerCase();
                        options.forEach(opt => {
                            const cn = opt.getAttribute('data-cn').toLowerCase();
                            opt.style.display = cn.includes(term) ? 'block' : 'none';
                        });
                    };

                    // Toggle de seleção: marca/desmarca e atualiza botão Confirmar
                    options.forEach(opt => {
                        opt.onclick = () => {
                            const dn = opt.getAttribute('data-dn');
                            const checkIcon = opt.querySelector('.check-icon');

                            if (tempSelected.has(dn)) {
                                tempSelected.delete(dn);
                                opt.classList.remove('bg-blue-50', 'dark:bg-blue-900/30', 'border-blue-200', 'dark:border-blue-800');
                                checkIcon.classList.add('hidden');
                            } else {
                                tempSelected.add(dn);
                                opt.classList.add('bg-blue-50', 'dark:bg-blue-900/30', 'border-blue-200', 'dark:border-blue-800');
                                checkIcon.classList.remove('hidden');
                            }
                            
                            // Feedback de quantidade a adicionar
                            const confirmBtn = Swal.getConfirmButton();
                            confirmBtn.innerText = tempSelected.size > 0 
                                ? `Adicionar ${tempSelected.size} grupo(s)` 
                                : 'Confirmar Seleção';
                        };
                    });
                }
            });

            // Se confirmou, mescla seleção ao conjunto atual sem duplicar
            if (confirmedGroups && confirmedGroups.length > 0) {
                selectedGroups = [...new Set([...selectedGroups, ...confirmedGroups])];
                updateGroupsUI();
            }
        };

            // -----------------------------------------
            // Form de edição (inputs e container grupos)
            // -----------------------------------------
            body.innerHTML = `
                <div class="col-span-2">
                    <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Nome de Exibição</label>
                    <input type="text" id="edit-displayname" class="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200" value="${current.displayName}">
                </div>
                <div class="col-span-2">
                    <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Descrição (Cargo)</label>
                    <input type="text" id="edit-description" class="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200" value="${current.description}">
                </div>
                
                <div>
                    <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Perfil / Setor</label>
                    <select id="edit-perfil" class="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200>
                        <option value="">Manter atual...</option>
                        ${Object.keys(PERFIL_MAP).map(p => `<option value="${p}">${p}</option>`).join('')}
                    </select>
                </div>

                <div>
                    <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Senioridade</label>
                    <select id="edit-deptnum" class="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
                        <option value="${current.departmentNumber}">${current.departmentNumber || 'Selecione...'}</option>
                        <option value="Estagiário">Estagiário</option>
                        <option value="Aprendiz">Aprendiz</option>
                        <option value="Júnior">Júnior</option>
                        <option value="Pleno">Pleno</option>
                        <option value="Sênior">Sênior</option>
                        <option value="Especialista">Especialista</option>
                    </select>
                </div>

                <div class="col-span-2 mt-4">
                    <label class="block text-xs font-bold text-slate-400 uppercase mb-2">Gerenciar Grupos (Clique em + para adicionar)</label>
                    <div id="edit-groups-container" class="flex flex-wrap max-h-40 overflow-y-auto custom-scrollbar bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-xl min-h-[60px]">
                    </div>
                </div>

                <div class="col-span-2">
                    <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Unidade Organizacional Alvo (OU)</label>
                    <div class="relative">
                        <input type="text" id="edit-ou" 
                            class="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-lg px-3 py-2 text-[11px] font-mono text-slate-500 overflow-x-auto" 
                            value="${decodeADString(current.dn.split(',').slice(1).join(','))}" 
                            readonly>
                    </div>
                </div>
            `;

            // Rodapé do modo de edição
            footer.innerHTML = `
                <button id="btn-cancel-edit" class="px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 transition">Cancelar</button>
                <button id="btn-save-edit" class="w-[180px] h-9 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"><i data-lucide="save" class="w-4 h-4"></i>Salvar Alterações</button>
            `;

            // Inicializa chips e listener do Perfil/Setor
            updateGroupsUI();

            // Ao trocar Perfil/Setor: aplica grupos e OU do mapeamento
            document.getElementById('edit-perfil').addEventListener('change', (e) => {
                const config = PERFIL_MAP[e.target.value];
                if (config) {
                    selectedGroups = [...config.groups];
                    updateGroupsUI();
                    const ouInput = document.getElementById('edit-ou');
                    if (ouInput) {
                        ouInput.value = decodeADString(config.targetOU);
                        ouInput.classList.add('ring-2', 'ring-blue-500/20');
                        setTimeout(() => ouInput.classList.remove('ring-2', 'ring-blue-500/20'), 1000);
                    }
                }
            });

            // Ações do rodapé (cancelar/Salvar)
            footer.querySelector('#btn-cancel-edit').onclick = renderViewMode;
            footer.querySelector('#btn-save-edit').onclick = () => saveUserChanges(username, selectedGroups);
        };

        // Render inicial: modo visualização
        renderViewMode();

    } catch (err) {
        // Tratativa de erro de carregamento inicial
        body.innerHTML = `<div class="col-span-2 py-10 text-center text-red-500 text-sm font-bold">Erro ao carregar dados: ${err.message}</div>`;
    }

    // Animação de entrada suave do modal/conteúdo
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
    }, 10);
}

// ======================================================================
// Salvamento das alterações (PUT):
// - Confirmação via SweetAlert
// - Envio do payload (displayName, description, deptNumber, OU, grupos)
// - Atualiza store local em caso de sucesso
// - Recarrega seção/lista após ação
// ======================================================================
const saveUserChanges = async (username, finalGroups) => {
    const saveBtn = document.getElementById('btn-save-edit');
    
    const result = await Swal.fire({
        title: 'Confirmar Alterações?',
        text: `Os dados de ${username} serão sincronizados com o AD.`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sim, salvar!',
        confirmButtonColor: '#2563eb',
        heightAuto: false, 
        scrollbarPadding: false, 
        background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
        color: document.documentElement.classList.contains('dark') ? '#f1f5f9' : '#1e293b'
    });

    if (!result.isConfirmed) return;

    // Estado de salvamento (loading)
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<i data-lucide="loader-2" class="animate-spin w-4 h-4"></i> Salvando...`;
    if (window.lucide) lucide.createIcons();

    // Monta payload a partir dos campos do formulário
    const payload = {
        displayName: document.getElementById('edit-displayname').value,
        description: document.getElementById('edit-description').value,
        departmentNumber: document.getElementById('edit-deptnum').value,
        targetOU: document.getElementById('edit-ou').value,
        targetGroups: finalGroups
    };

    try {
        // Requisição PUT para atualizar usuário no backend/AD
        const response = await fetch(`/api/users/${username}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            // Sincroniza store local para refletir alterações na UI imediatamente
            const userIndex = store.globalUsers.findIndex(u => u.username === username);
            if (userIndex !== -1) {
                store.globalUsers[userIndex].display_name = payload.displayName;
                store.globalUsers[userIndex].job_title = payload.description;
                store.globalUsers[userIndex].seniority = payload.departmentNumber;
                store.globalUsers[userIndex].member_of = payload.targetGroups.join(';');
            }
            
            // Feedback de sucesso rápido
            await Swal.fire({
                title: 'Sucesso!',
                text: 'Usuário atualizado com sucesso!',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false,
                heightAuto: false, 
                scrollbarPadding: false,
                background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
                color: document.documentElement.classList.contains('dark') ? '#f1f5f9' : '#1e293b'
            });

            // Fecha modal e recarrega seção/tabela
            closeModal();
            await refreshAfterUserAction();

        } else {
            const error = await response.json();
            throw new Error(error.error || 'Erro ao salvar alterações');
        }
    } catch (err) {
        // Feedback de erro e restaura botão de salvar
        Swal.fire({ 
            title: 'Erro!', 
            text: err.message, 
            icon: 'error', 
            heightAuto: false, 
            scrollbarPadding: false, 
            background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
            color: document.documentElement.classList.contains('dark') ? '#f1f5f9' : '#1e293b' 
        });
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> Salvar Alterações`;
        if (window.lucide) lucide.createIcons();
    }
};

// Fecha o modal com animação suave. Ignora cliques internos ao conteúdo.
export function closeModal(e) {
    const modal = document.getElementById('userModal');
    const content = document.getElementById('modalContent');
    if (!modal || !content) return;
    if (e && e.target !== modal) return;

    modal.classList.add('opacity-0');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');

    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 200);
}