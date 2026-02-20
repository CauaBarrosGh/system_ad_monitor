import { store } from "../state/store.js";
import { escapeHtml } from "../utils/security.js";
import { formatDate, getRoleBadge } from "../utils/format.js";

// Colunas tratadas como datas para ordenação
const DATE_COLS = ['last_logon', 'pwd_last_set', 'created_at'];

// Renderiza a tabela de usuários no tbody (#user-table-body)
export function renderUserTable(list) {
  const tbody = document.getElementById('user-table-body');
  if (!tbody) return;

  // Estado vazio da tabela
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-gray-400 dark:text-slate-500">Vazio</td></tr>`;
    return;
  }

  // Monta as linhas da tabela com dados do usuário
  // Importante: usa escapeHtml para evitar XSS em campos de texto
  tbody.innerHTML = list.map((u) => `
    <tr class="hover:bg-blue-50/50 dark:hover:bg-slate-700/50 transition border-b border-gray-50 dark:border-slate-700">
      <td class="px-6 py-3">
        <div class="flex flex-col">
          <span class="font-semibold text-gray-800 dark:text-slate-200 text-sm">${escapeHtml(u.display_name)}</span>
          <span class="text-xs text-gray-400 font-mono">${escapeHtml(u.username)}</span>
        </div>
      </td>
      <td class="px-6 py-3 align-middle">${getRoleBadge(u.role)}</td>
      <td class="px-6 py-3 text-xs text-gray-500 dark:text-slate-400 font-medium">${formatDate(u.last_logon)}</td>
      <td class="px-6 py-3 text-center">
        <span class="${u.is_enabled
          ? 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400'
          : 'text-red-400 bg-red-50 dark:bg-red-900/20 dark:text-red-400'} px-2 py-1 rounded-full text-[10px] font-bold border dark:border-transparent">
          ${u.is_enabled ? 'ATIVO' : 'OFF'}
        </span>
      </td>
    </tr>`).join('');

  // Re-renderiza os ícones lucide após injeção de HTML
  lucide.createIcons();
}

// Aplica filtros por texto, time (role) e status; re-renderiza a tabela filtrada
export function applyUserFilters() {
  const term = document.getElementById('searchInput')?.value?.toLowerCase() ?? '';
  const role = document.getElementById('roleFilter')?.value ?? '';
  const status = document.getElementById('statusFilter')?.value ?? '';

  const filtered = store.globalUsers.filter((u) => {
    // Texto: compara display_name e username
    const matchText =
      (u.display_name && u.display_name.toLowerCase().includes(term)) ||
      (u.username && u.username.toLowerCase().includes(term));

    // Role: vazio = todos, senão precisa ser igual
    const matchRole = role === "" || u.role === role;

    // Status: vazio = todos; 'active' = is_enabled true; 'inactive' = false
    const matchStatus = status === "" || (status === 'active' ? u.is_enabled : !u.is_enabled);

    return matchText && matchRole && matchStatus;
  });

  renderUserTable(filtered);
}

// Ordena a lista global por coluna mantendo estado (coluna e direção) em store
export function sortTable(col) {
  // Alterna direção ao clicar na mesma coluna; define padrão asc na troca de coluna
  if (store.userLastCol === col) store.userSortDir *= -1;
  else {
    store.userSortDir = 1;
    store.userLastCol = col;
  }

  // Ordena o array global (para manter consistência entre abas/visões)
  store.globalUsers.sort((a, b) => {
    let vA = a[col], vB = b[col];

    // Null/undefined empurrados para o final
    if (vA === null || vA === undefined) return 1;
    if (vB === null || vB === undefined) return -1;

    // Datas: converte para timestamp para comparação numérica
    if (DATE_COLS.includes(col)) {
      vA = new Date(vA).getTime();
      vB = new Date(vB).getTime();
    } else if (typeof vA === 'string') {
      // Strings: compara em minúsculas para consistência
      vA = vA.toLowerCase();
      vB = vB.toLowerCase();
    }

    return (vA < vB ? -1 : 1) * store.userSortDir;
  });

  // Reaplica filtros após ordenar para refletir imediatamente na UI
  applyUserFilters();
}