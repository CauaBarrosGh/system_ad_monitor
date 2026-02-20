import { parseDisabledDateFromDescription, isOverFiveYears } from "./disabledUtils.js";

// Função utilitária simples para atualizar texto de elementos
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value ?? "--";
}

// Atualiza os KPIs da aba de usuários desativados
export function updateDisabledKPIs(list) {
  const total = list.length; // Total geral

  let over5y = 0;          // Quantidade > 5 anos (expirados)
  let recentCount = 0;     // Desativados nos últimos 30 dias

  // Data de corte para "recentes"
  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30);

  // Processa cada usuário desativado
  for (const u of list) {

    // Extrai data de desativação da descrição (formato AD)
    const d = parseDisabledDateFromDescription(u.description);

    // Se não houver data válida, ignora esse usuário
    if (!d) continue;

    // KPI 1 — Legado (> 5 anos)
    if (isOverFiveYears(d)) {
      over5y++;
    }

    // KPI 2 — Recentes (desativados há <= 30 dias)
    if (d >= thirtyDaysAgo) {
      recentCount++;
    }
  }

  // Atualiza elementos do dashboard
  setText("kpi-disabled-total", total);
  setText("kpi-disabled-5y", over5y);
  setText("kpi-disabled-recent", recentCount);
}