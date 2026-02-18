import { store } from "../state/store.js";
import {
  parseDisabledDateFromDescription,
  formatBRDateOnly,
  daysSince,
  addFiveYears,
  isOverFiveYears
} from "./disabledUtils.js";

// Função Principal que orquestra Filtro -> Sort -> Render
export function applyDisabledFilters() {
  let data = [...store.globalDisabled];

  // 1. Filtro de Texto (Search Input)
  const searchInput = document.getElementById("disabledSearch");
  if (searchInput && searchInput.value.trim() !== "") {
    const term = searchInput.value.toLowerCase();
    data = data.filter((u) => {
      const name = (u.display_name || "").toLowerCase();
      const user = (u.username || "").toLowerCase();
      return name.includes(term) || user.includes(term);
    });
  }

  // 2. Filtro "Legado" (> 5 Anos)
  if (store.isDisabledLegacyFilter) {
    data = data.filter((u) => {
      const d = parseDisabledDateFromDescription(u.description);
      return d && isOverFiveYears(d);
    });
  }

  // 3. Ordenação
  if (store.disabledLastCol) {
    const col = store.disabledLastCol;
    const dir = store.disabledSortDir;

    data.sort((a, b) => {
      let valA, valB;

      // Extrai valores baseados na coluna
      if (col === 'name') {
        valA = (a.display_name || a.username || "").toLowerCase();
        valB = (b.display_name || b.username || "").toLowerCase();
      } else {
        // Colunas de data (date, days, expires) usam a data de desligamento base
        const dateA = parseDisabledDateFromDescription(a.description);
        const dateB = parseDisabledDateFromDescription(b.description);
        
        // Se não tiver data, joga pro final
        if (!dateA) return 1; 
        if (!dateB) return -1;

        valA = dateA.getTime();
        valB = dateB.getTime();
      }

      if (valA < valB) return -1 * dir;
      if (valA > valB) return 1 * dir;
      return 0;
    });
  }

  renderDisabledTable(data);
  updateDisabledIcons(); // Atualiza setinhas e cor do botão
}

// Renderização (Com botão de excluir)
export function renderDisabledTable(list) {
  const body = document.getElementById("disabled-table-body");
  if (!body) return;

  if (!list || list.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-10 text-gray-400 italic">
          Nenhum registro encontrado com os filtros atuais.
        </td>
      </tr>
    `;
    return;
  }

  body.innerHTML = list.map((u) => {
    const d = parseDisabledDateFromDescription(u.description);
    const dias = daysSince(d);
    const expira = addFiveYears(d);
    const over5 = isOverFiveYears(d);

    const badge = d
      ? over5
        ? `<span class="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-900">LEGADO</span>`
        : `<span class="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">RECENTE</span>`
      : `<span class="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border border-orange-200 dark:border-orange-900">SEM DATA</span>`;

    return `
      <tr class="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition border-b border-gray-50 dark:border-slate-700">
        <td class="px-6 py-3 font-medium text-gray-700 dark:text-slate-300">
          ${u.display_name || u.username}
          <div class="text-[10px] text-slate-400 font-mono">${u.username || ""}</div>
        </td>
        <td class="px-6 py-3">
          ${formatBRDateOnly(d)}
          <div class="mt-1">${badge}</div>
        </td>
        <td class="px-6 py-3 text-center">
          ${dias === null ? "—" : `<span class="font-bold text-slate-600 dark:text-slate-400">${dias}</span>`}
        </td>
        <td class="px-6 py-3 font-mono text-xs text-slate-500">
          ${formatBRDateOnly(expira)}
        </td>
        <td class="px-6 py-3 text-center">
            <button onclick="confirmDeleteDisabled('${u.username}')" 
              class="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
              title="Excluir Definitivamente">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
        </td>
      </tr>
    `;
  }).join("");
}

// --- Ações de Controle (Exportar para Main) ---

export function toggleLegacyFilter() {
  store.isDisabledLegacyFilter = !store.isDisabledLegacyFilter;
  applyDisabledFilters();
}

export function sortDisabledTable(colName) {
  if (store.disabledLastCol === colName) {
    store.disabledSortDir *= -1; // Inverte
  } else {
    store.disabledLastCol = colName;
    store.disabledSortDir = 1; // Default Asc
  }
  applyDisabledFilters();
}

// --- Exclusão Definitiva ---
export async function confirmDeleteDisabled(username) {
  // 1. Confirmação Visual
  const result = await Swal.fire({
    title: 'EXCLUSÃO DEFINITIVA',
    html: `Tem certeza que deseja apagar <b>${username}</b>?<br><span class="text-xs text-red-500">Essa ação remove do AD e não pode ser desfeita!</span>`,
    icon: 'warning',
    showCancelButton: true,
    background: '#1e293b',
    color: '#fff',
    confirmButtonColor: '#ef4444', 
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Sim, excluir!',
    cancelButtonText: 'Cancelar',
    heightAuto: false,
    scrollbarPadding: false
  });

  if (!result.isConfirmed) return;

  // 2. Loading
  Swal.fire({
    title: 'Apagando...',
    text: 'Comunicando com o Active Directory',
    didOpen: () => Swal.showLoading(),
    background: '#1e293b',
    color: '#fff',
    heightAuto: false,
    allowOutsideClick: false,
    scrollbarPadding: false
  });

  try {
    // 3. Chamada para a API
    const res = await fetch(`/api/disabled/${username}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await res.json();

    if (res.ok) {
      // 4. Sucesso
      await Swal.fire({
        icon: 'success',
        title: 'Excluído!',
        text: data.message,
        timer: 1500,
        background: '#1e293b',
        color: '#fff',
        showConfirmButton: false,
        heightAuto: false,
        scrollbarPadding: false
      });
      
      // Atualiza a tabela forçando o reload
      if (window.loadDisabled) window.loadDisabled({ force: true });
      
    } else {
      throw new Error(data.error || 'Erro desconhecido');
    }

  } catch (error) {
    Swal.fire({
      icon: 'error',
      title: 'Erro',
      text: error.message,
      background: '#1e293b',
      color: '#fff',
      heightAuto: false,
      scrollbarPadding: false
    });
  }
}

// Helpers Visuais
function updateDisabledIcons() {
  // 1. Atualiza botão de filtro
  const btn = document.getElementById("btn-filter-legacy");
  if (btn) {
    if (store.isDisabledLegacyFilter) {
      btn.classList.remove("bg-white", "text-gray-700", "border-gray-200");
      btn.classList.add("bg-red-100", "text-red-700", "border-red-300", "dark:bg-red-900", "dark:text-red-300");
    } else {
      btn.classList.add("bg-white", "text-gray-700", "border-gray-200");
      btn.classList.remove("bg-red-100", "text-red-700", "border-red-300", "dark:bg-red-900", "dark:text-red-300");
    }
  }

  // 2. Atualiza setinhas da tabela
  document.querySelectorAll(".sort-icon-disabled").forEach(el => el.setAttribute("data-lucide", "chevrons-up-down"));
  
  if (store.disabledLastCol) {
    const activeIcon = document.getElementById(`sort-disabled-${store.disabledLastCol}`);
    if (activeIcon) {
      activeIcon.setAttribute("data-lucide", store.disabledSortDir === 1 ? "chevron-up" : "chevron-down");
    }
  }
  
  // Recria ícones pois mudamos os data-lucide
  if (window.lucide) window.lucide.createIcons();
}