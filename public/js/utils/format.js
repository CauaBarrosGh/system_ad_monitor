import { ROLE_COLORS } from "../config/roleColors.js";

// Formata datas para pt-BR (dd/mm/aa); retorna '-' se não houver valor
export const formatDate = (d) =>
  d ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(d)) : '-';

// Calcula tempo de empresa a partir da data de início, em "X anos e Y meses"
export const calcTimeInCompany = (startDateStr) => {
  if (!startDateStr) return 'Recente';

  const start = new Date(startDateStr);
  const end = new Date();

  // Diferença em meses (ano->meses + delta de meses)
  let totalMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  // Ajuste quando o dia atual ainda não alcançou o dia de início
  if (end.getDate() < start.getDate()) totalMonths--;

  if (totalMonths < 1) return 'Recente';

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;

  // Monta string com pluralização correta (anos/meses)
  const result = [];
  if (years > 0) result.push(`${years} ano${years > 1 ? 's' : ''}`);
  if (months > 0) result.push(`${months} m${months > 1 ? 'eses' : 'ês'}`);

  return result.join(' e ');
};

// Gera badge HTML para cargo/função usando esquema de cores do ROLE_COLORS
export const getRoleBadge = (role) => {
  const r = role || 'COLABORADOR';
  const c = ROLE_COLORS[r] || ROLE_COLORS.COLABORADOR;

  return `<span style="background-color:${c.bg};color:${c.text};border-color:${c.bg}"
    class="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide border border-opacity-50 inline-block min-w-[80px] text-center shadow-sm">${r}</span>`;
};

// Retorna ícone de SO baseado no nome
export const getOSIcon = (osName) => {
  if (!osName) return '<i data-lucide="help-circle" class="w-4 h-4 text-gray-300"></i>';
  const lower = osName.toLowerCase();
  if (lower.includes('server')) return '<i data-lucide="server" class="w-4 h-4 text-purple-500"></i>';
  return '<i data-lucide="monitor" class="w-4 h-4 text-gray-500"></i>';
};

// Gera badge de score por faixas (>=50 vermelho, >=20 laranja, senão neutro)
export const getScoreBadge = (s) => {
  if (s >= 50) {
    return `<span class="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900 px-2 py-0.5 rounded font-bold">${s}</span>`;
  }
  if (s >= 20) {
    return `<span class="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-900 px-2 py-0.5 rounded font-bold">${s}</span>`;
  }
  return `<span class="bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-600 px-2 py-0.5 rounded font-bold">${s}</span>`;
};