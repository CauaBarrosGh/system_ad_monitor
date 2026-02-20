import { store } from "../state/store.js";
import { calcTimeInCompany, getRoleBadge } from "../utils/format.js";
import { ROLE_COLORS } from "../config/roleColors.js";

// Renderiza os cards do diretório (grid) no container #details-grid
export function renderDetailsGrid(list) {
  const grid = document.getElementById('details-grid');
  if (!grid) return;

  // Estado vazio
  if (list.length === 0) {
    grid.innerHTML = `<p class="text-gray-400 dark:text-slate-500 col-span-full text-center py-10">Ninguém encontrado.</p>`;
    return;
  }

  // Monta cada card de colaborador com dados principais
  grid.innerHTML = list.map((u) => {
    const c = ROLE_COLORS[u.role] || ROLE_COLORS.COLABORADOR; // cores por função
    const timeStr = calcTimeInCompany(u.data_inicio);         // "X anos e Y meses"

    return `
      <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-5 hover:shadow-md transition-all group relative overflow-hidden cursor-pointer"
        onclick="openUserModal('${u.username}')">
        <div class="absolute top-0 left-0 w-full h-1" style="background-color: ${c.chart}"></div>
        <div class="flex justify-between items-start mb-4">
          <div class="flex items-center gap-3">
            <div>
              <h4 class="font-bold text-slate-700 dark:text-slate-200 text-sm leading-tight">${u.display_name}</h4>
              <p class="text-xs text-slate-400 font-mono">${u.username}</p>
            </div>
          </div>
          ${getRoleBadge(u.role)}
        </div>
        <div class="space-y-2.5">
          <div class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 p-2 rounded-lg">
            <i data-lucide="briefcase" class="w-3.5 h-3.5 text-slate-400"></i>
            <span class="font-medium">${u.job_title || 'Não Definido'}</span>
          </div>
          <div class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 px-2">
            <i data-lucide="users" class="w-3.5 h-3.5 text-slate-400"></i>
            <span>Grupo: <span class="font-semibold text-slate-700 dark:text-slate-300">${u.department || 'Sem Equipe'}</span></span>
          </div>
          <div class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 px-2">
            <i data-lucide="user-check" class="w-3.5 h-3.5 text-slate-400"></i>
            <span>Gestor: <span class="font-semibold text-slate-700 dark:text-slate-300">${u.manager || '-'}</span></span>
          </div>
        </div>
        <div class="mt-4 pt-3 border-t border-slate-50 dark:border-slate-700 flex justify-between items-center text-[10px] text-slate-400">
          <span title="Tempo de Empresa"><i data-lucide="clock" class="w-3 h-3 inline mr-1"></i> ${timeStr}</span>
          <span title="Último Logon" class="${u.is_enabled ? 'text-green-600 dark:text-green-400' : 'text-red-400'} font-bold flex items-center gap-1">
            <div class="w-1.5 h-1.5 rounded-full ${u.is_enabled ? 'bg-green-500' : 'bg-red-500'}"></div> ${u.is_enabled ? 'Ativo' : 'Off'}
          </span>
        </div>
      </div>`;
  }).join('');

  // Re-renderiza os ícones após injetar HTML
  lucide.createIcons();
}

// Filtra por termo (nome/username) e por departamento; re-renderiza grid
export function filterDetails() {
  const term = document.getElementById('detailsSearch')?.value?.toLowerCase() ?? '';
  const dept = document.getElementById('deptFilter')?.value ?? '';

  const filtered = store.globalUsers.filter((u) => {
    const matchesName =
      (u.display_name && u.display_name.toLowerCase().includes(term)) ||
      (u.username && u.username.toLowerCase().includes(term));
    const matchesDept = dept === "" || u.department === dept;
    return matchesName && matchesDept;
  });

  renderDetailsGrid(filtered);
}

// Popula o select de departamentos (#deptFilter) com valores únicos, ordenados
export function populateDeptFilter(users) {
  const depts = [...new Set(users.map((u) => u.department).filter(Boolean))].sort();
  const select = document.getElementById('deptFilter');
  if (!select) return;

  select.innerHTML =
    '<option value="">Todos Departamentos</option>' +
    depts.map((d) => `<option value="${d}">${d}</option>`).join('');
}