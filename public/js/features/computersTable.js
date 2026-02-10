import { store } from "../state/store.js";
import { formatDate, getOSIcon } from "../utils/format.js";

export function renderCompTable(list) {
  const tbody = document.getElementById('comp-table-body');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-gray-400 dark:text-slate-500">Nenhum computador encontrado</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((c) => `
    <tr class="hover:bg-indigo-50/50 dark:hover:bg-slate-700/50 transition border-b border-gray-50 dark:border-slate-700">
      <td class="px-6 py-3 flex items-center gap-2 font-mono text-xs font-bold text-gray-700 dark:text-slate-300">${getOSIcon(c.os_name)} ${c.hostname}</td>
      <td class="px-6 py-3 text-xs text-gray-600 dark:text-slate-400">${c.os_name || 'Desconhecido'}</td>
      <td class="px-6 py-3 text-xs text-gray-400">${c.os_version || '-'}</td>
      <td class="px-6 py-3 text-xs text-gray-500 dark:text-slate-400">${formatDate(c.last_logon)}</td>
      <td class="px-6 py-3 text-center">
        <span class="${c.is_active
          ? 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400'
          : 'text-orange-400 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400'} px-2 py-1 rounded-full text-[10px] font-bold border dark:border-transparent">
          ${c.is_active ? 'ONLINE' : 'OFFLINE'}
        </span>
      </td>
      <td class="px-6 py-3 text-center">
        <button onclick="confirmDeleteComputer('${c.hostname}')"
          class="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
            title="Excluir Computador">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </td>
    </tr>`).join('');

  lucide.createIcons();
}

export function applyCompFilters() {
  const term = document.getElementById('compSearchInput')?.value?.toLowerCase() ?? '';

  const filtered = store.globalComputers.filter((c) => {
    const matchText =
      (c.hostname && c.hostname.toLowerCase().includes(term)) ||
      (c.os_name && c.os_name.toLowerCase().includes(term));

    const isServer = c.os_name && c.os_name.toLowerCase().includes('server');

    let matchType = true;
    if (store.currentTypeFilter === 'server') matchType = isServer;
    if (store.currentTypeFilter === 'workstation') matchType = !isServer;

    let matchSixMonths = true;
    if (store.isSixMonthsFilter) {
      if (!c.last_logon) matchSixMonths = true;
      else {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        matchSixMonths = new Date(c.last_logon) < sixMonthsAgo;
      }
    }

    return matchText && matchType && matchSixMonths;
  });

  renderCompTable(filtered);
}

export function setCompFilter(type) {
  store.currentTypeFilter = type;

  ['all', 'workstation', 'server'].forEach((t) => {
    const el = document.getElementById(`btn-filter-${t}`);
    if (!el) return;
    el.className = (t === type)
      ? "px-3 py-1 text-xs rounded-md transition-all filter-btn-active"
      : "px-3 py-1 text-xs rounded-md text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white transition-all";
  });

  applyCompFilters();
}

export function toggleSixMonths() {
  store.isSixMonthsFilter = !store.isSixMonthsFilter;

  const btn = document.getElementById('btn-six-months');
  if (btn) {
    btn.className = store.isSixMonthsFilter
      ? "flex items-center gap-1 px-3 py-1.5 border border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-900 text-red-600 dark:text-red-400 text-xs font-bold rounded-lg transition-all shadow-sm"
      : "flex items-center gap-1 px-3 py-1.5 border border-red-200 dark:border-red-900 text-red-500 dark:text-red-400 text-xs font-medium rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-all";
  }

  applyCompFilters();
}

export function sortCompTable(col) {
  if (store.compLastCol === col) store.compSortDir *= -1;
  else {
    store.compSortDir = 1;
    store.compLastCol = col;
  }

  store.globalComputers.sort((a, b) => {
    let vA = a[col], vB = b[col];
    if (vA === null) return 1;
    if (vB === null) return -1;

    if (typeof vA === 'string') {
      vA = vA.toLowerCase();
      vB = vB.toLowerCase();
    }

    return (vA < vB ? -1 : 1) * store.compSortDir;
  });

  applyCompFilters();
}

export async function confirmDeleteComputer(computerName) {
  const result = await Swal.fire({
    title: 'EXCLUIR MÁQUINA',
    html: `Tem certeza que deseja apagar <b>${computerName}</b> do AD?<br><span class="text-xs text-red-500">Essa ação é irreversível!</span>`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Sim, excluir!',
    cancelButtonText: 'Cancelar'
  });

  if (!result.isConfirmed) return;

  Swal.fire({
    title: 'Apagando...',
    didOpen: () => Swal.showLoading()
  });

  try {
    const res = await fetch(`/api/inventory/computers/${computerName}`, {
      method: 'DELETE'
    });
    const data = await res.json();

    if (res.ok) {
      await Swal.fire('Excluído!', data.message, 'success');
      if (window.loadInventory) window.loadInventory({ force: true });

    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    Swal.fire('Erro', error.message, 'error');
  }
}