export function parseDisabledDateFromDescription(description) {
  if (!description) return null;
  const m = String(description).match(/Desligado em\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  if (!m) return null;

  const dd = Number(m[1]);
  const mm = Number(m[2]) - 1;
  const yy = Number(m[3]);

  const d = new Date(yy, mm, dd);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatBRDateOnly(date) {
  if (!date) return "--";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = date.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

export function daysSince(date) {
  if (!date) return null;
  const diff = Date.now() - date.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function addFiveYears(date) {
  if (!date) return null;
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + 5);
  return d;
}

// Regra correta por calendário (evita bissexto/1825 dias)
export function isOverFiveYears(disabledDate) {
  if (!disabledDate) return false;
  const expiry = addFiveYears(disabledDate);
  return expiry.getTime() <= Date.now();
}