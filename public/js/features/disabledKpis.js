import { parseDisabledDateFromDescription, isOverFiveYears } from "./disabledUtils.js";

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value ?? "--";
}

export function updateDisabledKPIs(list) {
  const total = list.length;
  
  let over5y = 0;
  let recentCount = 0; // Variável para os recentes

  // Define a data de corte (30 dias atrás)
  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30);

  for (const u of list) {
    // Tenta pegar a data da descrição
    const d = parseDisabledDateFromDescription(u.description);
    
    // Se não tiver data, ignora esse usuário nos cálculos de tempo
    if (!d) continue; 

    // KPI 1: Legado (> 5 anos)
    if (isOverFiveYears(d)) {
      over5y++;
    }

    // KPI 2: Recentes (Data de desligamento >= 30 dias atrás)
    if (d >= thirtyDaysAgo) {
      recentCount++;
    }
  }

  // Atualiza os elementos na tela
  setText("kpi-disabled-total", total);
  setText("kpi-disabled-5y", over5y);
  setText("kpi-disabled-recent", recentCount);
}