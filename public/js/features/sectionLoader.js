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

let listenersBound = false;
let profileLoaded = false;

// listener específico dos desativados
let disabledListenersBound = false;

async function ensureProfileLoaded() {
  if (profileLoaded) return;
  await loadUserProfile();
  profileLoaded = true;
}

// helper opcional: se quiser tratar 401 em qualquer fetch
async function safeJson(res) {
  if (res.status === 401) {
    window.location.href = "/html/login.html";
    throw new Error("Sessão expirada (401)");
  }
  return res.json();
}

/* =========================
   LOADERS (ABAS)
========================= */

export async function loadOverview({ force = false } = {}) {
  await ensureProfileLoaded();

  if (!force && store.loaded.overview) return;

  const [resKpi, resUsers] = await Promise.all([
    fetch("/api/kpis"),
    fetch("/api/users"),
  ]);

  const kpi = await safeJson(resKpi);
  store.globalUsers = await safeJson(resUsers);

  updateOverviewKPIs(kpi, store.globalUsers);
  renderRoleChart(store.globalUsers);
  setupRoleFilter(store.globalUsers);

  renderUserTable(store.globalUsers);
  applyUserFilters();

  bindListenersOnce();

  store.loaded.overview = true;
  store.loadedAt.overview = Date.now();
}

export async function loadDetails({ force = false } = {}) {
  await ensureProfileLoaded();

  if (!force && store.loaded.details) return;

  if (!store.globalUsers.length || force) {
    const resUsers = await fetch("/api/users");
    store.globalUsers = await safeJson(resUsers);
  }

  populateDeptFilter(store.globalUsers);
  renderDetailsGrid(store.globalUsers);
  filterDetails();

  bindListenersOnce();

  store.loaded.details = true;
  store.loadedAt.details = Date.now();
}

export async function loadInventory({ force = false } = {}) {
  await ensureProfileLoaded();

  if (!force && store.loaded.inventory) return;

  const tbody = document.getElementById('comp-table-body');
  if (tbody) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="text-center py-8 text-slate-600 dark:text-slate-400">' +
      '<i data-lucide="loader-2" class="animate-spin inline mr-2"></i>Carregando computadores...</td></tr>';
    if (window.lucide) lucide.createIcons();
  }
  const resComp = await fetch("/api/computers");
  store.globalComputers = await safeJson(resComp);

  updateInventoryKPIs(store.globalComputers);
  renderCompTable(store.globalComputers);
  applyCompFilters();

  bindListenersOnce();

  store.loaded.inventory = true;
  store.loadedAt.inventory = Date.now();
}

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

export async function loadAudit({ force = false } = {}) {
  await ensureProfileLoaded();

  if (!force && store.loaded.audit && store.globalAudit.length) return;

  await loadAuditLogs();

  store.loaded.audit = true;
  store.loadedAt.audit = Date.now();
}

/**
 * ✅ Aba: Desativados
 * - Busca do banco via API (GET /api/disabled-users)
 * - Render KPIs + tabela
 * - Bind busca (#disabledSearch)
 */
export async function loadDisabled({ force = false } = {}) {
  await ensureProfileLoaded();

  if (!force && store.loaded.disabled && store.globalDisabled.length) return;

  const tbody = document.getElementById("disabled-table-body");
  if (tbody) {
    // colspan deve bater com o número de colunas do THEAD da tabela (aqui: 4)
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center py-10 text-gray-400">
          Carregando desativados...
        </td>
      </tr>
    `;
  }

  const res = await fetch("/api/disabled-users");
  store.globalDisabled = await safeJson(res);

  updateDisabledKPIs(store.globalDisabled);
  renderDisabledTable(store.globalDisabled);

  bindDisabledListenersOnce();

  store.loaded.disabled = true;
  store.loadedAt.disabled = Date.now();

  if (window.lucide) lucide.createIcons();
}

/* =========================
   LISTENERS GLOBAIS
========================= */

function debounce(fn, delay = 200) {
  let timerId;
  return (...args) => {
    clearTimeout(timerId);
    timerId = setTimeout(() => fn(...args), delay);
  };
}

function bindListenersOnce() {
  if (listenersBound) return;
  listenersBound = true;

  const debouncedUserFilters = debounce(applyUserFilters, 200);
  const debouncedDetailsFilter = debounce(filterDetails, 200);
  const debouncedCompFilters = debounce(applyCompFilters, 200);

  document.getElementById("roleFilter")?.addEventListener("change", applyUserFilters);
  document.getElementById("statusFilter")?.addEventListener("change", applyUserFilters);
  document.getElementById("deptFilter")?.addEventListener("change", filterDetails);
  document.getElementById("searchInput")?.addEventListener("keyup", debouncedUserFilters);
  document.getElementById("detailsSearch")?.addEventListener("keyup", debouncedDetailsFilter);
  document.getElementById("compSearchInput")?.addEventListener("keyup", debouncedCompFilters);
  document.getElementById("disabledSearch")?.addEventListener("keyup", applyDisabledFilters);
}

/*
 * ✅ Listener da aba desativados:
 * - busca por username/display_name
 */
function bindDisabledListenersOnce() {
  if (disabledListenersBound) return;
  disabledListenersBound = true;

  const search = document.getElementById("disabledSearch");
  if (!search) return;

  const apply = () => {
    const filtered = filterDisabled(store.globalDisabled, search.value || "");
    //updateDisabledKPIs(filtered); ATIVAR SE QUISER QUE OS KPIS ALTEREM COM O FILTRO
    renderDisabledTable(filtered);
    if (window.lucide) lucide.createIcons();
  };

  search.addEventListener("keyup", apply);
}

/* =========================
   HELPERS EXISTENTES
========================= */

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value ?? "--";
}

function updateOverviewKPIs(kpi, users) {
  setText("kpi-total", kpi.total);
  setText("kpi-ativos", kpi.ativos);
  setText("kpi-inativos", kpi.inativos);

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  setText(
    "kpi-ghosts",
    users.filter((u) => u.is_enabled && u.last_logon && new Date(u.last_logon) < ninetyDaysAgo).length
  );
}

function updateInventoryKPIs(computers) {
  setText("comp-total", computers.length);
  setText("comp-servers", computers.filter((c) => c.os_name && c.os_name.toLowerCase().includes("server")).length);
  setText("comp-offline", computers.filter((c) => !c.is_active).length);

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  setText("comp-stale", computers.filter((c) => c.last_logon && new Date(c.last_logon) < sixMonthsAgo).length);
}

function updateSecurityKPIs(security) {
  setText("soc-high", security.filter((u) => u.risk_score >= 50).length);
  setText("soc-med", security.filter((u) => u.risk_score >= 20 && u.risk_score < 50).length);
  setText("soc-total", security.length);
}

function setupRoleFilter(users) {
  const roleFilter = document.getElementById("roleFilter");
  if (!roleFilter) return;

  const roles = [...new Set(users.map((u) => u.role))].sort();
  roleFilter.innerHTML =
    '<option value="">Todos Times</option>' +
    roles.map((r) => `<option value="${r}">${r}</option>`).join("");
}

function renderRoleChart(users) {
  const roleStats = users.reduce((acc, u) => {
    const key = u.role || "COLABORADOR";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const sortedRoles = Object.entries(roleStats).sort((a, b) => b[1] - a[1]);
  const ctx = document.getElementById("myChart");
  if (!ctx) return;

  if (window.myPieChart) window.myPieChart.destroy();

  const isDark = document.documentElement.classList.contains("dark");

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

function renderSecuritySection(security) {
  const top5 = security.slice(0, 5);
  const listContainer = document.getElementById("top-risk-list");

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


// REFRESH GLOBAL 
export async function refreshAfterUserAction() {
  // Marca caches como "sujos" (o que depende de users)
  store.loaded.overview = false;
  store.loaded.details = false;
  store.loaded.security = false;
  store.loaded.audit = false;

  // Descobre qual aba está ativa (sem depender do navigation.js)
  const activeTab = getActiveTabFromDOM();

  // Recarrega somente a aba que o usuário está vendo (forçado)
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

export function getActiveTabFromDOM() {
  const ids = ["overview", "details", "inventory", "security", "audit", "disabled", "register"];
  const found = ids.find((id) => {
    const el = document.getElementById("view-" + id);
    return el && !el.classList.contains("hidden");
  });
  return found || null;
}