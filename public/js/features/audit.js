import { store } from "../state/store.js";

export async function loadAuditLogs() {
  try {
    const tbody = document.getElementById('audit-table-body');
    if (!tbody) return;

    tbody.innerHTML =
      '<tr><td colspan="6" class="text-center py-8 text-slate-600 dark:text-slate-400">' +
      '<i data-lucide="loader-2" class="animate-spin inline mr-2"></i>Carregando logs...</td></tr>';
    lucide.createIcons();

    const res = await fetch('/api/audit');
    const logs = await res.json();
    store.globalAudit = logs;

    if (logs.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="text-center py-8 text-slate-400 dark:text-slate-500">' +
        'Nenhum registro encontrado.</td></tr>';
      return;
    }

    tbody.innerHTML = logs.map((log) => {
      const date = new Date(log.timestamp).toLocaleString('pt-BR');

      const statusBadge = log.status === 'SUCESSO'
        ? '<span class="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 text-xs font-bold px-2 py-0.5 rounded border border-green-200 dark:border-green-800">SUCESSO</span>'
        : '<span class="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 text-xs font-bold px-2 py-0.5 rounded border border-red-200 dark:border-red-800">ERRO</span>';

        const actionBadge =
          log.action === 'EXCLUSÃO'
              ? '<span class="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 text-xs font-bold px-2 py-0.5 rounded border border-red-200 dark:border-red-800">EXCLUSÃO</span>'
          : log.action === 'DESLIGAMENTO'
              ? '<span class="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 text-xs font-bold px-2 py-0.5 rounded border border-yellow-200 dark:border-yellow-800">DESLIGAMENTO</span>'
          : log.action === 'DESBLOQUEIO'
              ? '<span class="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 text-xs font-bold px-2 py-0.5 rounded border border-green-200 dark:border-green-800">DESBLOQUEIO</span>'
          : `<span class="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
              ${log.action}
            </span>`;

      return `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700 align-middle">
          <td class="px-6 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">${date}</td>
          <td class="px-6 py-3 font-bold text-slate-700 dark:text-slate-200">${actionBadge}</td>
          <td class="px-6 py-3">
            <div class="flex items-center gap-2">
              <i data-lucide="shield" class="w-3 h-3 text-blue-500 dark:text-blue-400"></i>
              <span class="text-slate-700 dark:text-slate-300">${log.executor}</span>
            </div>
          </td>
          <td class="px-6 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">${log.target}</td>
          <td class="px-6 py-3">${statusBadge}</td>
          <td class="px-6 py-3 text-xs text-slate-500 dark:text-slate-400 italic max-w-xs truncate" title="${log.details}">${log.details}</td>
        </tr>`;
    }).join('');

    lucide.createIcons();
  } catch (err) {
    console.error("Erro ao carregar auditoria:", err);
    const tbody = document.getElementById('audit-table-body');
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="text-center py-8 text-red-600 dark:text-red-400">Erro ao carregar logs.</td></tr>';
    }
  }
}