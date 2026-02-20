import { store } from "../state/store.js";
import { loadUserProfile } from "./profile.js";
import { ROLE_COLORS } from "../config/roleColors.js";
import { renderUserTable, applyUserFilters } from "./usersTable.js";
import { populateDeptFilter, renderDetailsGrid, filterDetails } from "./detailsGrid.js";
import { renderCompTable, applyCompFilters } from "./computersTable.js";
import { getScoreBadge } from "../utils/format.js";
import { loadAuditLogs } from "./audit.js";
import { updateDisabledKPIs } from "./disabledKpis.js";
import { renderDisabledTable } from "./disabledTable.js";
import { filterDisabled } from "./disabledFilters.js";
import { applyDisabledFilters } from "./disabledTable.js";

// Flags internas para evitar múltiplos binds de listeners e cargas redundantes.
let listenersBound = false;
let profileLoaded = false;

// Flag específica para listeners da aba "Desativados".
let disabledListenersBound = false;

// Garante que o perfil do usuário foi carregado (apenas uma vez).
async function ensureProfileLoaded() {
  if (profileLoaded) return;
  await loadUserProfile();
  profileLoaded = true;
}


 // Helper para tratar respostas JSON de fetch com interceptação de 401 - Redireciona para /html/login.html em caso de sessão expirada.
async function safeJson(res) {
  if (res.status === 401) {
    window.location.href = "/html/login.html";
    throw new Error("Sessão expirada (401)");
  }
  return res.json();
}

// Carrega a aba "Overview" (Visão geral):
export async function loadOverview({ force = false } = {}) {
  await ensureProfileLoaded();

  // Evita recarregar se já está em cache e sem "force"
  if (!force && store.loaded.overview) return;

  // Carrega KPIs + lista de usuários em paralelo para otimizar tempo de carga
  const [resKpi, resUsers] = await Promise.all([
    fetch("/api/kpis"),
    fetch("/api/users"),
  ]);

  const kpi = await safeJson(resKpi);
  store.globalUsers = await safeJson(resUsers);

  // Atualiza indicadores e visualizações
  updateOverviewKPIs(kpi, store.globalUsers);
  renderRoleChart(store.globalUsers);
  setupRoleFilter(store.globalUsers);

  // Render + aplicar filtros inicias
  renderUserTable(store.globalUsers);
  applyUserFilters();

  // Listeners globais (apenas 1x)
  bindListenersOnce();

  // Atualiza metadados de cache
  store.loaded.overview = true;
  store.loadedAt.overview = Date.now();
}

/**
 * Carrega a aba "Details":
 * - Popula filtro de departamento
 * - Renderiza grade (cards/lista) de detalhes
 * - Aplica filtros
 */
export async function loadDetails({ force = false } = {}) {
  await ensureProfileLoaded();

  if (!force && store.loaded.details) return;

  // Se não houver cache de usuários ou se for uma recarga forçada, busca novamente
  if (!store.globalUsers.length || force) {
    const resUsers = await fetch("/api/users");
    store.globalUsers = await safeJson(resUsers);
  }

  // Prepara UI: filtros, grid e filtros ativos
  populateDeptFilter(store.globalUsers);
  renderDetailsGrid(store.globalUsers);
  filterDetails();

  bindListenersOnce();

  store.loaded.details = true;
  store.loadedAt.details = Date.now();
}

/**
 * Carrega a aba "Inventory" (Computadores):
 * - Mostra placeholder de loading na tabela
 * - Busca inventário e atualiza KPIs
 * - Renderiza tabela e aplica filtros
 */
export async function loadInventory({ force = false } = {}) {
  await ensureProfileLoaded();

  if (!force && store.loaded.inventory) return;

  // Feedback visual de carregamento na tabela (tbody)
  const tbody = document.getElementById('comp-table-body');
  if (tbody) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="text-center py-8 text-slate-600 dark:text-slate-400">' +
      '<i data-lucide="loader-2" class="animate-spin inline mr-2"></i>Carregando computadores...</td></tr>';
    if (window.lucide) lucide.createIcons();
  }

  // Busca inventário de computadores
  const resComp = await fetch("/api/computers");
  store.globalComputers = await safeJson(resComp);

  // KPIs + render
  updateInventoryKPIs(store.globalComputers);
  renderCompTable(store.globalComputers);
  applyCompFilters();

  bindListenersOnce();

  store.loaded.inventory = true;
  store.loadedAt.inventory = Date.now();
}

/**
 * Carrega a aba "Security":
 * - Busca dados de risco/segurança
 * - Atualiza KPIs e seção de riscos
 */
export async function loadSecurity({ force = false } = {}) {
  await ensureProfileLoaded();

  if (!force && store.loaded.security) return;

  const resSec = await fetch("/api/security");
  store.globalSecurity = await safeJson(resSec);

  updateSecurityKPIs(store.globalSecurity);
  renderSecuritySection(store.globalSecurity);

  store.loaded.security = true;
  store.loadedAt.security = Date.now();
}

/**
 * Carrega a aba "Audit":
 * - Reusa função do módulo audit.js
 * - Evita recarga se já houver dados e sem force
 */
export async function loadAudit({ force = false } = {}) {
  await ensureProfileLoaded();

  if (!force && store.loaded.audit && store.globalAudit.length) return;

  await loadAuditLogs();

  store.loaded.audit = true;
  store.loadedAt.audit = Date.now();
}

/**
 *  Aba: Desativados
 * - Busca do banco via API (GET /api/disabled-users)
 * - Render KPIs + tabela
 * - Bind de busca (#disabledSearch)
 */
export async function loadDisabled({ force = false } = {}) {
  await ensureProfileLoaded();

  if (!force && store.loaded.disabled && store.globalDisabled.length) return;

  // Feedback de carregamento no corpo da tabela (colspan deve refletir o THEAD da tabela)
  const tbody = document.getElementById("disabled-table-body");
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center py-10 text-gray-400">
          Carregando desativados...
        </td>
      </tr>
    `;
  }

  // Busca lista de usuários desativados
  const res = await fetch("/api/disabled-users");
  store.globalDisabled = await safeJson(res);

  // KPIs + tabela
  updateDisabledKPIs(store.globalDisabled);
  renderDisabledTable(store.globalDisabled);

  // Liga listeners específicos da aba (apenas uma vez)
  bindDisabledListenersOnce();

  store.loaded.disabled = true;
  store.loadedAt.disabled = Date.now();

  if (window.lucide) lucide.createIcons();
}

// Debounce utilitário para evitar disparo excessivo de filtros
function debounce(fn, delay = 200) {
  let timerId;
  return (...args) => {
    clearTimeout(timerId);
    timerId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Registra listeners das áreas comuns (filtros e buscas) apenas uma vez.
 * Usa debounce para entradas de texto.
 */
function bindListenersOnce() {
  if (listenersBound) return;
  listenersBound = true;

  // Versões com debounce
  const debouncedUserFilters = debounce(applyUserFilters, 200);
  const debouncedDetailsFilter = debounce(filterDetails, 200);
  const debouncedCompFilters = debounce(applyCompFilters, 200);

  // Overview/Users
  document.getElementById("roleFilter")?.addEventListener("change", applyUserFilters);
  document.getElementById("statusFilter")?.addEventListener("change", applyUserFilters);
  document.getElementById("searchInput")?.addEventListener("keyup", debouncedUserFilters);

  // Details
  document.getElementById("deptFilter")?.addEventListener("change", filterDetails);
  document.getElementById("detailsSearch")?.addEventListener("keyup", debouncedDetailsFilter);

  // Inventory
  document.getElementById("compSearchInput")?.addEventListener("keyup", debouncedCompFilters);

  // Disabled (este é adicional; também há bind específico abaixo)
  document.getElementById("disabledSearch")?.addEventListener("keyup", applyDisabledFilters);
}

/**
 *  Listener específico da aba "Desativados":
 * - Busca por username/display_name com re-render da tabela.
 * - Se quiser que os KPIs também alterem conforme o filtro, descomente a linha indicada.
 */
function bindDisabledListenersOnce() {
  if (disabledListenersBound) return;
  disabledListenersBound = true;

  const search = document.getElementById("disabledSearch");
  if (!search) return;

  const apply = () => {
    const filtered = filterDisabled(store.globalDisabled, search.value || "");
    // updateDisabledKPIs(filtered); // ATIVAR SE QUISER QUE OS KPIS ALTEREM COM O FILTRO
    renderDisabledTable(filtered);
    if (window.lucide) lucide.createIcons();
  };

  search.addEventListener("keyup", apply);
}

/* 
   HELPERS EXISTENTES
   - Funções utilitárias de UI e cálculo de KPIs.
*/
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value ?? "--";
}

// Atualiza KPIs da aba Overview, incluindo "ghost users" (90 dias sem logon).
function updateOverviewKPIs(kpi, users) {
  setText("kpi-total", kpi.total);
  setText("kpi-ativos", kpi.ativos);
  setText("kpi-inativos", kpi.inativos);

  // Data de corte: 90 dias atrás
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // Conta usuários "fantasmas": habilitados com last_logon antigo
  setText(
    "kpi-ghosts",
    users.filter((u) => u.is_enabled && u.last_logon && new Date(u.last_logon) < ninetyDaysAgo).length
  );
}

// Atualiza KPIs do inventário (computadores) - total, servidores, offline e desatualizados (stale = sem logon há 6 meses)
function updateInventoryKPIs(computers) {
  setText("comp-total", computers.length);
  setText("comp-servers", computers.filter((c) => c.os_name && c.os_name.toLowerCase().includes("server")).length);
  setText("comp-offline", computers.filter((c) => !c.is_active).length);

  // Data de corte: 6 meses atrás
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  setText("comp-stale", computers.filter((c) => c.last_logon && new Date(c.last_logon) < sixMonthsAgo).length);
}

// Atualiza KPIs de segurança: - SOC High (>=50), Medium (>=20 && <50), Total
function updateSecurityKPIs(security) {
  setText("soc-high", security.filter((u) => u.risk_score >= 50).length);
  setText("soc-med", security.filter((u) => u.risk_score >= 20 && u.risk_score < 50).length);
  setText("soc-total", security.length);
}

// Preenche o filtro de "role" com valores únicos ordenados.
function setupRoleFilter(users) {
  const roleFilter = document.getElementById("roleFilter");
  if (!roleFilter) return;

  const roles = [...new Set(users.map((u) => u.role))].sort();
  roleFilter.innerHTML =
    '<option value="">Todos Times</option>' +
    roles.map((r) => `<option value="${r}">${r}</option>`).join("");
}

// Renderiza o gráfico de rolagem por papel (role) usando Chart.js em formato Doughnut.
function renderRoleChart(users) {
  const roleStats = users.reduce((acc, u) => {
    const key = u.role || "COLABORADOR";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  // Ordena por maior quantidade
  const sortedRoles = Object.entries(roleStats).sort((a, b) => b[1] - a[1]);

  // Recupera canvas
  const ctx = document.getElementById("myChart");
  if (!ctx) return;

  // Destroi gráfico anterior para evitar memory leaks/duplicações
  if (window.myPieChart) window.myPieChart.destroy();

  const isDark = document.documentElement.classList.contains("dark");

  // Instancia Chart.js Doughnut
  window.myPieChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: sortedRoles.map(([role]) => role),
      datasets: [{
        data: sortedRoles.map(([, count]) => count),
        backgroundColor: sortedRoles.map(([role]) => (ROLE_COLORS[role] || ROLE_COLORS.COLABORADOR).chart),
        borderWidth: 2,
        borderColor: isDark ? "#1e293b" : "#ffffff",
      }],
    },
    options: {
      maintainAspectRatio: false,
      cutout: "60%",
      plugins: {
        legend: {
          position: "right",
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            color: isDark ? "#cbd5e1" : "#64748b",
          },
        },
      },
    },
  });
}

/**
 * Renderiza a seção de segurança:
 * - Lista Top 5 por risco
 * - Tabela detalhada com badges de score e fatores de risco
 * Usa utilitário getScoreBadge para exibir score com estilo.
 */
function renderSecuritySection(security) {
  const top5 = security.slice(0, 5);
  const listContainer = document.getElementById("top-risk-list");

  // Bloco Top 5
  if (listContainer) {
    listContainer.innerHTML =
      top5.length === 0
        ? '<p class="text-gray-400 text-sm italic">Nenhum risco detectado.</p>'
        : top5.map((u) => `
            <div class="flex items-center justify-between p-3 rounded-lg bg-red-50/50 dark:bg-red-900/20 border border-red-100 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold">${u.risk_score}</div>
                <div>
                  <p class="text-sm font-bold text-gray-800 dark:text-slate-200 leading-none">${u.display_name}</p>
                  <p class="text-[10px] text-gray-500 dark:text-slate-400 mt-1">${u.department || "Geral"}</p>
                </div>
              </div>
            </div>
          `).join("");
  }

  // Tabela detalhada de riscos
  const riskBody = document.getElementById("risk-table-body");
  if (riskBody) {
    riskBody.innerHTML = security.map((u) => `
      <tr class="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition border-b border-gray-50 dark:border-slate-700">
        <td class="px-4 py-3 font-medium text-gray-700 dark:text-slate-300">${u.display_name}</td>
        <td class="px-4 py-3 text-center">${getScoreBadge(u.risk_score)}</td>
        <td class="px-4 py-3 text-xs">
          ${u.risk_factors.map((f) =>
            `<span class="inline-block bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded mr-1 mb-1 border border-slate-200 dark:border-slate-600 shadow-sm">${f}</span>`
          ).join("")}
        </td>
      </tr>
    `).join("");
  }

  if (window.lucide) lucide.createIcons();
}

/**
 * REFRESH GLOBAL
 * Após alguma ação do usuário (e.g., CRUD), invalida caches
 * e recarrega apenas a aba atualmente visível.
 */
export async function refreshAfterUserAction() {
  // Invalida caches relacionados a usuários
  store.loaded.overview = false;
  store.loaded.details = false;
  store.loaded.security = false;
  store.loaded.audit = false;
  store.loaded.disabled = false;

  // Descobre aba ativa pelo DOM (sem depender de navigation.js)
  const activeTab = getActiveTabFromDOM();

  // Recarrega somente o que o usuário está vendo (forçado)
  if (activeTab === "overview") {
    await loadOverview({ force: true });
  } else if (activeTab === "details") {
    await loadDetails({ force: true });
  } else if (activeTab === "security") {
    await loadSecurity({ force: true });
  } else if (activeTab === "audit") {
    await loadAudit({ force: true });
  }
}

/**
 * Retorna a aba ativa ao inspecionar elementos DOM:
 * - Considera IDs: overview, details, inventory, security, audit, disabled, register
 * - Checa se #view-{id} está visível (sem classe 'hidden')
 */
export function getActiveTabFromDOM() {
  const ids = ["overview", "details", "inventory", "security", "audit", "disabled", "register"];
  const found = ids.find((id) => {
    const el = document.getElementById("view-" + id);
    return el && !el.classList.contains("hidden");
  });
  return found || null;
}