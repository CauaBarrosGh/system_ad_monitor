import { loadOverview, loadDetails, loadInventory, loadSecurity, loadAudit, loadDisabled} from "../features/sectionLoader.js";

const tabs = ["overview", "details", "inventory", "security", "audit","disabled"];
let currentTab = "overview";
const loading = new Map();

const loaders = {
  overview: loadOverview,
  details: loadDetails,
  inventory: loadInventory,
  security: loadSecurity,
  audit: loadAudit,
  disabled: loadDisabled,
};

export async function switchTab(tabId) {
  if (!tabId || !tabs.includes(tabId)) return;
  if (tabId === currentTab) return;

  // troca só duas views
  document.getElementById("view-" + currentTab)?.classList.add("hidden");
  document.getElementById("view-" + tabId)?.classList.remove("hidden");

  // troca só dois botões
  setInactive(currentTab);
  setActive(tabId);

  // título
  setHeaderTitle(tabId);

  currentTab = tabId;

  // lazy-load com proteção
  await loadTabIfNeeded(tabId);
}

function setInactive(tabId) {
  const btn = document.getElementById("btn-" + tabId);
  if (!btn) return;
  btn.className =
    "w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-slate-800 hover:text-white rounded-lg transition-colors";
}

function setActive(tabId) {
  const btn = document.getElementById("btn-" + tabId);
  if (!btn) return;

  let activeColor = "bg-blue-600";
  if (tabId === "security") activeColor = "bg-red-600";

  btn.className =
    `w-full flex items-center gap-3 px-4 py-3 ${activeColor} rounded-lg text-white shadow-lg transition-all hover:scale-[1.02]`;
}

function setHeaderTitle(tabId) {
  const titles = {
    overview: "Dashboard Operacional",
    details: "Diretório de Pessoas",
    inventory: "Inventário de Hardware",
    security: "Gerenciamento de Risco",
    audit: "Auditoria & Logs",
    disabled: "Usuários Desativados",
  };

  const headerTitle = document.getElementById("header-title");
  if (headerTitle) headerTitle.innerText = titles[tabId] || "Dashboard";
}

async function loadTabIfNeeded(tabId) {
  const loader = loaders[tabId];
  if (!loader) return;

  // evita duplicidade de load na mesma aba
  if (loading.has(tabId)) return loading.get(tabId);

  const p = (async () => {
    // deixa o browser pintar a aba antes do fetch/render
    await new Promise(requestAnimationFrame);
    await loader();
  })().finally(() => loading.delete(tabId));

  loading.set(tabId, p);
  return p;
}