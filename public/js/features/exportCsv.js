import { store } from "../state/store.js";

export function exportCSV() {
  let dataToExport = [];
  let filename = 'relatorio.csv';

  const activeTab = ['overview', 'details', 'inventory', 'security', 'audit', 'disabled'].find((id) => {
    const el = document.getElementById('view-' + id);
    return el && !el.classList.contains('hidden');
  });

  switch (activeTab) {
    case 'inventory':
      dataToExport = store.globalComputers;
      filename = 'inventario_ti.csv';
      break;
    case 'security':
      dataToExport = store.globalSecurity;
      filename = 'relatorio_seguranca_riscos.csv';
      break;
    case 'audit':
      dataToExport = store.globalAudit;
      filename = 'logs_auditoria.csv';
      break;
    case 'disabled':
      dataToExport = store.globalDisabled;              
      filename = 'usuarios_desativados.csv';             
      break;
    case 'details':
    default:
      dataToExport = store.globalUsers;
      filename = 'usuarios_ad.csv';
      break;
  }

  if (!dataToExport || dataToExport.length === 0) {
    return alert("Não há dados carregados nesta aba para exportar!");
  }

  const headers = Object.keys(dataToExport[0]).join(',');

  const rows = dataToExport.map((obj) =>
    Object.values(obj)
      .map((val) => {
        const str = String(val === null || val === undefined ? '' : val);
        return `"${str.replace(/"/g, '""')}"`;
      })
      .join(',')
  );

  const csvContent = [headers, ...rows].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");

  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}