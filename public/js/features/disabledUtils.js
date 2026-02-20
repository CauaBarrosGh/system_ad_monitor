// Extrai a data de desligamento da descrição do AD - Formato esperado: "Desligado em DD/MM/AAAA" 
export function parseDisabledDateFromDescription(description) {
  if (!description) return null;

  // Captura dia/mês/ano usando regex
  const m = String(description).match(/Desligado em\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  if (!m) return null;

  const dd = Number(m[1]);
  const mm = Number(m[2]) - 1; 
  const yy = Number(m[3]);

  const d = new Date(yy, mm, dd);

  // Se data inválida, retorna null
  return Number.isNaN(d.getTime()) ? null : d;
}

// Formata data para padrão brasileiro DD/MM/AAAA
export function formatBRDateOnly(date) {
  if (!date) return "--";

  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = date.getFullYear();

  return `${dd}/${mm}/${yy}`;
}

// Retorna quantidade de dias desde a data informada
export function daysSince(date) {
  if (!date) return null;

  const diff = Date.now() - date.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24)); // converte ms → dias
}

// Adiciona 5 anos à data informada (mantém lógica de calendário real)
export function addFiveYears(date) {
  if (!date) return null;

  const d = new Date(date);
  d.setFullYear(d.getFullYear() + 5);
  return d;
}

// Verifica se o desligamento ultrapassou 5 anos
export function isOverFiveYears(disabledDate) {
  if (!disabledDate) return false;

  const expiry = addFiveYears(disabledDate);
  return expiry.getTime() <= Date.now();
}