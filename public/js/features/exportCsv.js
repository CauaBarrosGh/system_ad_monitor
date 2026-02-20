import { store } from "../state/store.js";

// Exporta dados para CSV baseado na aba atualmente visível
export function exportCSV() {

  let dataToExport = [];
  let filename = 'relatorio.csv';

  // Detecta qual aba está ativa (visível)
  const activeTab = ['overview', 'details', 'inventory', 'security', 'audit', 'disabled'].find((id) => {
    const el = document.getElementById('view-' + id);
    return el && !el.classList.contains('hidden');
  });

  // Para cada aba, retorna o conjunto de dados correspondente + nome do arquivo
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

  // Se a aba não tiver dados, alerta e interrompe
  if (!dataToExport || dataToExport.length === 0) {
    return alert("Não há dados carregados nesta aba para exportar!");
  }

  // Cabeçalhos: nomes das chaves do objeto
  const headers = Object.keys(dataToExport[0]).join(',');

  // Monta cada linha do CSV convertendo valores e escapando aspas
  const rows = dataToExport.map((obj) =>
    Object.values(obj)
      .map((val) => {
        const str = String(val === null || val === undefined ? '' : val);
        return `"${str.replace(/"/g, '""')}"`;
      })
      .join(',')
  );

  // Junta cabeçalho + linhas
  const csvContent = [headers, ...rows].join('\n');

  // Cria arquivo temporário via Blob
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");

  // Gera URL temporária e configura o download
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';

  // Executa o download
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}