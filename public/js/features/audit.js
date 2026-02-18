import { store } from "../state/store.js";

// 1. CARREGAR DADOS (Fetch)
export async function loadAuditLogs() {
  // Renderiza Loading
  renderAuditLoading();

  try {
    const res = await fetch('/api/audit');
    const logs = await res.json();
    
    // Salva na Store Global
    store.globalAudit = logs;

    // Aplica os filtros (que já chama o render)
    applyAuditFilters();

  } catch (err) {
    console.error("Erro ao carregar auditoria:", err);
    renderAuditError();
  }
}

// 2. FILTRAR DADOS (Logic)
export function applyAuditFilters() {
  // Se não tem dados, não faz nada
  if (!store.globalAudit) return;

  let filtered = [...store.globalAudit];

  // A. Pega valores dos Inputs
  const dateInput = document.getElementById('auditFilterDate')?.value;
  const actionInput = document.getElementById('auditFilterAction')?.value;
  const searchInput = document.getElementById('auditFilterSearch')?.value?.toLowerCase();
  const statusInput = document.getElementById('auditFilterStatus')?.value;

  // B. Aplica Filtros
  filtered = filtered.filter(log => {
    // 1. Filtro de Data (Compara YYYY-MM-DD)
    if (dateInput) {
      // O log.timestamp vem como ISO (ex: 2023-10-05T14:00:00.000Z).
      // Pegamos só os 10 primeiros caracteres para comparar a data.
      const logDate = log.timestamp.substring(0, 10);
      if (logDate !== dateInput) return false;
    }

    // 2. Filtro de Ação (Exato)
    if (actionInput && log.action !== actionInput) return false;

    // 3. Filtro de Status (Exato)
    if (statusInput && log.status !== statusInput) return false;

    // 4. Filtro de Texto (Executor OU Alvo)
    if (searchInput) {
      const executor = (log.executor || "").toLowerCase();
      const target = (log.target || "").toLowerCase();
      // Retorna true se encontrar o texto em qualquer um dos dois
      if (!executor.includes(searchInput) && !target.includes(searchInput)) return false;
    }

    return true;
  });

  // C. Renderiza a lista filtrada
  renderAuditTable(filtered);
}

// 3. DESENHAR TABELA (Render)
function renderAuditTable(list) {
  const tbody = document.getElementById('audit-table-body');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="text-center py-10 text-slate-400 dark:text-slate-500 italic">' +
      'Nenhum registro encontrado com os filtros atuais.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map((log) => {
    // Formata data bonita (PT-BR)
    const date = new Date(log.timestamp).toLocaleString('pt-BR');

    // Badge de Status
    const statusBadge = log.status === 'SUCESSO'
      ? '<span class="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">SUCESSO</span>'
      : '<span class="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-[10px] font-bold px-2 py-0.5 rounded border border-red-200 dark:border-red-800">ERRO</span>';

    // Badge de Ação
    let actionClass = "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700";
    if (log.action === 'EXCLUSÃO USUÁRIO' || log.action === 'EXCLUSÃO COMPUTADOR') actionClass = "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-900";
    if (log.action === 'DESLIGAMENTO') actionClass = "bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-100 dark:border-orange-900";
    if (log.action === 'DESBLOQUEIO') actionClass = "bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 border-yellow-100 dark:border-yellow-900";
    if (log.action === 'CADASTRO USUÁRIO') actionClass = "bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-100 dark:border-green-900";

    const actionBadge = `<span class="${actionClass} text-[10px] font-bold px-2 py-0.5 rounded border border-opacity-50">${log.action}</span>`;

    return `
      <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700/50 transition-colors">
        <td class="px-6 py-3 font-mono text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
            ${date}
        </td>
        <td class="px-6 py-3">${actionBadge}</td>
        <td class="px-6 py-3">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-slate-700 dark:text-slate-300">${log.executor}</span>
          </div>
        </td>
        <td class="px-6 py-3 font-mono text-xs font-bold text-slate-600 dark:text-slate-300">
            ${log.target}
        </td>
        <td class="px-6 py-3">${statusBadge}</td>
        <td class="px-6 py-3 text-xs text-slate-500 dark:text-slate-400 italic max-w-xs truncate" title="${log.details}">
            ${log.details}
        </td>
      </tr>`;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

// 4. HELPERS VISUAIS (Loading e Erro)
function renderAuditLoading() {
  const tbody = document.getElementById('audit-table-body');
  if (tbody) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="text-center py-10 text-slate-500 dark:text-slate-400">' +
      '<i data-lucide="loader-2" class="animate-spin inline mr-2 w-5 h-5 text-blue-500"></i>Carregando histórico...</td></tr>';
    if (window.lucide) lucide.createIcons();
  }
}

function renderAuditError() {
  const tbody = document.getElementById('audit-table-body');
  if (tbody) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="text-center py-10 text-red-500 dark:text-red-400">' +
      '<i data-lucide="alert-circle" class="inline mr-2 w-5 h-5"></i>Erro ao carregar logs.</td></tr>';
    if (window.lucide) lucide.createIcons();
  }
}

window.applyAuditFilters = applyAuditFilters;

window.clearAuditFilters = function() {
    document.getElementById('auditFilterDate').value = '';
    document.getElementById('auditFilterAction').value = '';
    document.getElementById('auditFilterSearch').value = '';
    document.getElementById('auditFilterStatus').value = '';
    applyAuditFilters();
}