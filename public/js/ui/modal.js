import { store } from "../state/store.js";
import { ROLE_COLORS } from "../config/roleColors.js";
import { calcTimeInCompany, formatDate, getRoleBadge } from "../utils/format.js";
import { unlockUserAccount, confirmDisable } from "../features/userActions.js";

export function openUserModal(username) {
  const user = store.globalUsers.find((u) => u.username === username);
  if (!user) return;

  const modal = document.getElementById('userModal');
  const content = document.getElementById('modalContent');
  const body = document.getElementById('modalBody');
  const footer = document.getElementById('modalFooter');

  const c = ROLE_COLORS[user.role] || ROLE_COLORS.COLABORADOR;
  const timeStr = calcTimeInCompany(user.data_inicio);

  body.innerHTML = `
    <div class="col-span-2 flex items-center gap-4 mb-2">
      <div class="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold border-2" style="background-color: ${c.bg}; color: ${c.text}; border-color: ${c.bg}">
        ${user.display_name.charAt(0)}
      </div>
      <div>
        <h2 class="text-2xl font-bold text-slate-800 dark:text-slate-100">${user.display_name}</h2>
        <p class="text-slate-500 dark:text-slate-400 font-mono">${user.email || 'Sem e-mail'}</p>
        <div class="mt-2">${getRoleBadge(user.role)}</div>
      </div>
    </div>

    <div class="space-y-4">
      <div><p class="text-xs font-bold text-slate-400 uppercase">Departamento</p><p class="text-slate-700 dark:text-slate-300 font-medium">${user.department || '-'}</p></div>
      <div><p class="text-xs font-bold text-slate-400 uppercase">Cargo</p><p class="text-slate-700 dark:text-slate-300 font-medium">${user.job_title || '-'}</p></div>
      <div><p class="text-xs font-bold text-slate-400 uppercase">Senioridade</p><p class="text-slate-700 dark:text-slate-300 font-medium">${user.seniority || '-'}</p></div>
      <div><p class="text-xs font-bold text-slate-400 uppercase">Gestor</p><p class="text-slate-700 dark:text-slate-300 font-medium">${user.manager || '-'}</p></div>
    </div>

    <div class="space-y-4">
      <div><p class="text-xs font-bold text-slate-400 uppercase">Status</p><p class="${user.is_enabled ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'} font-bold">${user.is_enabled ? '✅ ATIVO' : '⛔ DESATIVADO'}</p></div>
      <div><p class="text-xs font-bold text-slate-400 uppercase">Tempo de empresa</p><p class="text-slate-700 dark:text-slate-300 font-medium flex items-center gap-1"><i data-lucide="clock" class="w-3 h-3 text-slate-400"></i> ${timeStr}</p></div>
      <div><p class="text-xs font-bold text-slate-400 uppercase">Último Logon</p><p class="text-slate-700 dark:text-slate-300 font-medium">${formatDate(user.last_logon)}</p></div>
      <div><p class="text-xs font-bold text-slate-400 uppercase">Senha Trocada</p><p class="text-slate-700 dark:text-slate-300 font-medium">${formatDate(user.pwd_last_set)}</p></div>
    </div>
  `;

  footer.innerHTML = `
    <div class="flex items-center space-x-2">
      <button id="btn-unlock" class="p-1 text-blue-400 hover:text-blue-300 transition" title="Desbloquear">
        <i data-lucide="lock-open"></i>
      </button>
      <button id="btn-disable" class="p-1 text-red-500 hover:text-red-400 transition" title="Desativar">
        <i data-lucide="user-x"></i>
      </button>
    </div>
  `;

  footer.querySelector('#btn-unlock')?.addEventListener('click', () => unlockUserAccount(user.username));
  footer.querySelector('#btn-disable')?.addEventListener('click', () => confirmDisable(user.username, user.display_name));

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  setTimeout(() => {
    modal.classList.remove('opacity-0');
    content.classList.remove('scale-95');
    content.classList.add('scale-100');
  }, 10);

  lucide.createIcons();
}

export function closeModal(e) {
  if (!e || e.target.id === 'userModal' || !e.target.closest('#modalContent')) {
    const modal = document.getElementById('userModal');
    const content = document.getElementById('modalContent');

    modal.classList.add('opacity-0');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');

    setTimeout(() => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }, 200);
  }
}