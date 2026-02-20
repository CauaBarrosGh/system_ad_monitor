import { store } from "../state/store.js";            
import { ROLE_COLORS } from "../config/roleColors.js"; 
import { calcTimeInCompany, formatDate, getRoleBadge } from "../utils/format.js"; 
import { unlockUserAccount, confirmDisable } from "../features/userActions.js";    
import { refreshAfterUserAction } from "../features/sectionLoader.js";            
import { renderUserTable, applyUserFilters } from "../features/usersTable.js";    
import { renderDetailsGrid } from "../features/detailsGrid.js";                   

// Mapeia "Perfil/Setor" -> grupos padrão no AD
const PERFIL_MAP = {
    'TI': { groups: ['CN=Dev - TI,OU=Grupos de Segurança,OU=SOC,DC=soc,DC=com,DC=br','CN=SocTodos,OU=Grupos de Segurança,OU=SOC,DC=soc,DC=com,DC=br'] },
    'GSI': { groups: ['CN=DEV - Gestão de Sistemas Internos,OU=Grupos de Segurança,OU=SOC,DC=soc,DC=com,DC=br','CN=SocTodos,OU=Grupos de Segurança,OU=SOC,DC=soc,DC=com,DC=br'] },
    'SI': { groups: [] },
    'COMERCIAL': { groups: [] },
    'RH': { groups: [] }
};

// Decodifica strings do AD em formato hex escapado (\c3\a7 -> ç)
function decodeADString(str) {
    if (!str) return '';
    try {
        return decodeURIComponent(str.replace(/\\([0-9a-fA-F]{2})/g, '%$1'));
    } catch (e) {
        return str; // Fallback seguro se não conseguir decodificar
    }
}

// Abre o modal do usuário, busca detalhes no backend e renderiza visão/edição
export async function openUserModal(username) {
    const userStore = store.globalUsers.find((u) => u.username === username);
    if (!userStore) return;

    const modal = document.getElementById('userModal');
    const content = document.getElementById('modalContent');
    const body = document.getElementById('modalBody');
    const footer = document.getElementById('modalFooter');

    // Estado inicial de carregamento
    body.innerHTML = `
        <div class="col-span-2 flex flex-col items-center justify-center py-20 gap-4">
            <i data-lucide="loader-2" class="animate-spin h-10 w-10 text-blue-500"></i>
            <p class="text-sm font-bold text-slate-500 uppercase tracking-widest">Consultando AD...</p>
        </div>`;
    
    // Exibe modal com animação inicial
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide) lucide.createIcons();

    try {
        // Consulta detalhes do usuário no backend
        const response = await fetch(`/api/users/${username}/details`);
        const adData = await response.json();
        const details = adData.details;

        // Renderiza o "modo visualização" com dados do AD e do store
        const renderViewMode = () => {
            const c = ROLE_COLORS[userStore.role] || ROLE_COLORS.COLABORADOR;
            const timeStr = calcTimeInCompany(userStore.data_inicio);
            
            // OU decodificada para leitura humana
            const ouRaw = details.dn ? details.dn.split(',').slice(1).join(',') : '-';
            const ouClean = decodeADString(ouRaw);

            // Extrai CN do gestor
            const managerClean = details.manager ? details.manager.match(/CN=([^,]+)/)?.[1] : 'Não definido';
            
            // Lista de grupos (CN)
            const groupsHtml = details.groups.map(g => {
                const cn = g.match(/CN=([^,]+)/i)?.[1] || g;
                return `<span class="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-bold px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 mr-2 mb-2">${cn}</span>`;
            }).join('');

            // InnerHTML com dados do AD: considerar escapeHtml() se houver risco de entrada malformada
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

            // Ações de rodapé (editar/desbloquear/desativar)
            footer.innerHTML = `
                <div class="flex items-center space-x-2">
                    <button id="btn-edit" class="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500 hover:text-blue-500 transition shadow-sm"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
                    <button id="btn-unlock" class="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-blue-500 hover:bg-blue-100 transition shadow-sm" title="Desbloquear"><i data-lucide="lock-open" class="w-4 h-4"></i></button>
                    <button id="btn-disable" class="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-red-500 hover:bg-red-100 transition shadow-sm" title="Desativar"><i data-lucide="user-x" class="w-4 h-4"></i></button>
                </div>
            `;

            // Handlers dos botões do rodapé
            footer.querySelector('#btn-edit').onclick = () => enterEditMode(username, details);
            footer.querySelector('#btn-unlock').onclick = () => unlockUserAccount(username);
            footer.querySelector('#btn-disable').onclick = () => confirmDisable(username, details.displayName);
            if (window.lucide) lucide.createIcons();
        };

        // Modo de edição: permite alterar campos e gerenciar grupos
        const enterEditMode = (username, current) => {
            let selectedGroups = [...current.groups];

            // Renderiza mini-chips dos grupos selecionados e permite remover
            const updateGroupsUI = () => {
                const container = document.getElementById('edit-groups-container');
                if (!container) return;
                container.innerHTML = selectedGroups.map((g, index) => {
                    const cn = g.match(/CN=([^,]+)/i)?.[1] || g;
                    return `
                        <div class="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-bold px-2 py-1 rounded border border-blue-100 dark:border-blue-800 mr-2 mb-2">
                            <span>${cn}</span>
                            <button type="button" class="btn-remove-group hover:text-red-500" data-index="${index}"><i data-lucide="x" class="w-3 h-3"></i></button>
                        </div>
                    `;
                }).join('');
                
                // Remoção de grupos via botão (atualiza UI local)
                container.querySelectorAll('.btn-remove-group').forEach(btn => {
                    btn.onclick = (e) => {
                        const idx = e.currentTarget.dataset.index;
                        selectedGroups.splice(idx, 1);
                        updateGroupsUI();
                    };
                });
                if (window.lucide) lucide.createIcons();
            };

            // InnerHTML populado com dados atuais: considerar escapeHtml() se origem externa
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
                    <select id="edit-perfil" class="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
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
                        <option value="Assistente">Assistente</option>
                        <option value="Júnior">Júnior</option>
                        <option value="Pleno">Pleno</option>
                        <option value="Sênior">Sênior</option>
                        <option value="Especialista">Especialista</option>
                        <option value="Engenheiro">Engenheiro</option>
                        <option value="Liderança">Lider</option>
                        <option value="ProductManager">Product Manager</option>
                    </select>
                </div>

                <div class="col-span-2 mt-2">
                    <label class="block text-xs font-bold text-slate-400 uppercase mb-2">Gerenciar Grupos</label>
                    <div id="edit-groups-container" class="flex flex-wrap max-h-24 overflow-y-auto custom-scrollbar border border-dashed border-slate-200 dark:border-slate-700 p-2 rounded-lg">
                    </div>
                </div>
            `;

            // Rodapé do modo de edição (Cancelar/Salvar)
            footer.innerHTML = `
                <button id="btn-cancel-edit" class="px-4 py-2 text-xs font-medium text-slate-500">Cancelar</button>
                <button id="btn-save-edit" class="w-[180px] h-9 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2">Salvar Alterações</button>
            `;

            updateGroupsUI();

            // Alteração de perfil aplica grupos padrão do mapa
            document.getElementById('edit-perfil').addEventListener('change', (e) => {
                const config = PERFIL_MAP[e.target.value];
                if (config) {
                    selectedGroups = [...config.groups];
                    updateGroupsUI();
                }
            });

            // Ações do rodapé no modo de edição
            footer.querySelector('#btn-cancel-edit').onclick = renderViewMode;
            footer.querySelector('#btn-save-edit').onclick = () => saveUserChanges(username, selectedGroups);
        };

        // Primeiro renderiza a visão
        renderViewMode();

    } catch (err) {
        // Exibe erro de backend/carregamento
        body.innerHTML = `<div class="col-span-2 py-10 text-center text-red-500 text-sm font-bold">${err.message}</div>`;
    }

    // Animação de entrada do modal (fade/scale)
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
    }, 10);
}

// Persiste alterações do usuário (PUT), atualiza store/visões e feedback via SweetAlert
const saveUserChanges = async (username, finalGroups) => {
    const saveBtn = document.getElementById('btn-save-edit');
    
    // Confirmação antes de sincronizar com AD
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

    // Desabilita botão e mostra spinner durante o save
    saveBtn.disabled = true;
    saveBtn.className = "w-[180px] h-9 bg-blue-600 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 opacity-80 cursor-not-allowed";
    saveBtn.innerHTML = `
        <svg class="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Salvando...
    `;

    // Monta payload com campos editáveis
    const payload = {
        displayName: document.getElementById('edit-displayname').value,
        description: document.getElementById('edit-description').value,
        departmentNumber: document.getElementById('edit-deptnum').value,
        targetGroups: finalGroups
    };

    try {
        // PUT para atualizar no backend/AD
        const response = await fetch(`/api/users/${username}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            // Sincroniza store local para refletir alterações de imediato
            const userIndex = store.globalUsers.findIndex(u => u.username === username);
            if (userIndex !== -1) {
                store.globalUsers[userIndex].display_name = payload.displayName;
                store.globalUsers[userIndex].job_title = payload.description;
                store.globalUsers[userIndex].seniority = payload.departmentNumber;
                store.globalUsers[userIndex].department = payload.description;
                store.globalUsers[userIndex].member_of = payload.targetGroups.join(';');
            }
            
            // Força re-render das visões (tabela/detalhes/filtros) sem refresh da página
            if (typeof renderUserTable === 'function') renderUserTable(store.globalUsers);
            if (typeof renderDetailsGrid === 'function') renderDetailsGrid(store.globalUsers);
            if (typeof applyUserFilters === 'function') applyUserFilters();

            // Feedback de sucesso rápido
            await Swal.fire({
                title: 'Sucesso!',
                icon: 'success',
                timer: 1000,
                showConfirmButton: false,
                heightAuto: false,
                scrollbarPadding: false, 
            });

            // Fecha modal e atualiza seções que dependem do backend
            closeModal();
            await refreshAfterUserAction();

        } else {
            // Propaga erro do backend
            const error = await response.json();
            throw new Error(error.error || 'Erro ao salvar alterações');
        }
    } catch (err) {
        Swal.fire({ title: 'Erro!', text: err.message, icon: 'error', heightAuto: false, scrollbarPadding: false });
        saveBtn.disabled = false;
        saveBtn.className = "h-9 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all";
        saveBtn.innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> Salvar Alterações`;
        if (window.lucide) lucide.createIcons();
    }
};

// Fecha o modal com clique no backdrop e animação de saída
export function closeModal(e) {
    const modal = document.getElementById('userModal');
    const content = document.getElementById('modalContent');
    if (!modal || !content) return;
    if (e && e.target !== modal) return;

    // Animação de saída (fade/scale)
    modal.classList.add('opacity-0');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');

    // Esconde após a animação
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 200);
}