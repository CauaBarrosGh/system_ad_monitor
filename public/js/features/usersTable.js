import { store } from "../state/store.js";
import { escapeHtml } from "../utils/security.js";
import { formatDate, getRoleBadge } from "../utils/format.js";

const DATE_COLS = ['last_logon', 'pwd_last_set', 'created_at'];

export function renderUserTable(list) {
  const tbody = document.getElementById('user-table-body');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-gray-400 dark:text-slate-500">Vazio</td></tr>`;
    return;
  }

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

  lucide.createIcons();
}

export function applyUserFilters() {
  const term = document.getElementById('searchInput')?.value?.toLowerCase() ?? '';
  const role = document.getElementById('roleFilter')?.value ?? '';
  const status = document.getElementById('statusFilter')?.value ?? '';

  const filtered = store.globalUsers.filter((u) => {
    const matchText =
      (u.display_name && u.display_name.toLowerCase().includes(term)) ||
      (u.username && u.username.toLowerCase().includes(term));
    const matchRole = role === "" || u.role === role;
    const matchStatus = status === "" || (status === 'active' ? u.is_enabled : !u.is_enabled);
    return matchText && matchRole && matchStatus;
  });

  renderUserTable(filtered);
}

export function sortTable(col) {
  if (store.userLastCol === col) store.userSortDir *= -1;
  else {
    store.userSortDir = 1;
    store.userLastCol = col;
  }

  store.globalUsers.sort((a, b) => {
    let vA = a[col], vB = b[col];

    if (vA === null || vA === undefined) return 1;
    if (vB === null || vB === undefined) return -1;

    if (DATE_COLS.includes(col)) {
      vA = new Date(vA).getTime();
      vB = new Date(vB).getTime();
    } else if (typeof vA === 'string') {
      vA = vA.toLowerCase();
      vB = vB.toLowerCase();
    }

    return (vA < vB ? -1 : 1) * store.userSortDir;
  });

  applyUserFilters();
}