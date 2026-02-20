import { loadOverview, loadDetails, loadInventory, loadSecurity, loadAudit, loadDisabled} from "../features/sectionLoader.js";

// Abas disponíveis e estado atual
const tabs = ["overview", "details", "inventory", "security", "audit","disabled","register"];
let currentTab = "overview";
// Controle de cargas em andamento por aba (evita chamadas duplicadas)
const loading = new Map();

// Mapa de loaders por aba (lazy-load por demanda)
const loaders = {
  overview: loadOverview,
  details: loadDetails,
  inventory: loadInventory,
  security: loadSecurity,
  audit: loadAudit,
  disabled: loadDisabled,
  register: async () => { return; },
};

// Troca de aba: alterna visibilidade/estilos, atualiza título e faz lazy-load seguro
export async function switchTab(tabId) {
  if (!tabId || !tabs.includes(tabId)) return;
  if (tabId === currentTab) return;

  // Esconde a view ativa e mostra a nova
  document.getElementById("view-" + currentTab)?.classList.add("hidden");
  document.getElementById("view-" + tabId)?.classList.remove("hidden");

  // Atualiza estado visual dos botões
  setInactive(currentTab);
  setActive(tabId);

  // Atualiza título do header
  setHeaderTitle(tabId);

  currentTab = tabId;

  // Carregamento preguiçoso (com proteção contra repetição)
  await loadTabIfNeeded(tabId);
}

// Define estilo "inativo" no botão da aba
function setInactive(tabId) {
  const btn = document.getElementById("btn-" + tabId);
  if (!btn) return;
  btn.className =
    "w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-slate-800 hover:text-white rounded-lg transition-colors";
}

// Define estilo "ativo" no botão da aba (cor especial para security)
function setActive(tabId) {
  const btn = document.getElementById("btn-" + tabId);
  if (!btn) return;

  let activeColor = "bg-blue-600";
  if (tabId === "security") activeColor = "bg-red-600";

  btn.className =
    `w-full flex items-center gap-3 px-4 py-3 ${activeColor} rounded-lg text-white shadow-lg transition-all hover:scale-[1.02]`;
}

// Atualiza o título do cabeçalho conforme a aba
function setHeaderTitle(tabId) {
  const titles = {
    overview: "Dashboard Operacional",
    details: "Diretório de Pessoas",
    inventory: "Inventário de Hardware",
    security: "Gerenciamento de Risco",
    audit: "Auditoria & Logs",
    disabled: "Usuários Desativados",
    register: "Novo Usuário",
  };

  const headerTitle = document.getElementById("header-title");
  if (headerTitle) headerTitle.innerText = titles[tabId] || "Dashboard";
}

// Executa o loader da aba apenas se necessário e garante uma única execução concorrente
async function loadTabIfNeeded(tabId) {
  const loader = loaders[tabId];
  if (!loader) return;

  if (loading.has(tabId)) return loading.get(tabId);

  const p = (async () => {
    await new Promise(requestAnimationFrame);
    await loader();
  })().finally(() => loading.delete(tabId));

  loading.set(tabId, p);
  return p;
}