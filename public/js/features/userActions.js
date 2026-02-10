import { closeModal } from "../ui/modal.js";
import { refreshAfterUserAction } from "./sectionLoader.js";

export async function unlockUserAccount(username) {
  if (!confirm(`Tem certeza que deseja desbloquear o usuário ${username}?`)) return;

  try {
    const btn = document.querySelector('#modalFooter button');
    const originalHtml = btn?.innerHTML;

    if (btn) {
      btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Processando...`;
      btn.disabled = true;
      lucide.createIcons();
    }

    const res = await fetch(`/api/users/${username}/unlock`, { method: 'POST' });

    if (res.ok) {
      alert('✅ Usuário desbloqueado com sucesso no Active Directory!');
      closeModal();
      await refreshAfterUserAction();
    } else {
      const err = await res.json();
      alert('❌ Erro: ' + (err.error || 'Falha ao desbloquear'));
    }

    if (btn && originalHtml) btn.innerHTML = originalHtml;
  } catch (e) {
    alert('Erro de conexão com o servidor.');
    console.error(e);
  } finally {
    const btn = document.querySelector('#modalFooter button');
    if (btn) {
      btn.innerHTML = `<i data-lucide="unlock" class="w-4 h-4"></i> Desbloquear Conta`;
      btn.disabled = false;
      lucide.createIcons();
    }
  }
}

export async function confirmDisable(username, displayName) {
  const result = await Swal.fire({
    title: 'DESLIGAMENTO IMEDIATO',
    html: `
      <p class="text-gray-300">Você está prestes a desligar <b>${displayName}</b>.</p>
      <ul class="text-left text-sm mt-3 text-gray-400 list-disc pl-5">
        <li>Remove de todos os grupos</li>
        <li>Renomeia para "Zz ${displayName} Zz"</li>
        <li>Move para a pasta "Desativados"</li>
        <li>Bloqueia o acesso</li>
      </ul>
      <p class="mt-4 text-red-400 font-bold">Essa ação é irreversível via sistema!</p>
    `,
    icon: 'warning',
    background: '#1e293b',
    color: '#fff',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Sim, DESLIGAR AGORA',
    cancelButtonText: 'Cancelar',
    focusCancel: true,
    scrollbarPadding: false,
    heightAuto: false
  });

  if (!result.isConfirmed) return;

  Swal.fire({
    title: 'Processando...',
    text: 'Aplicando regras de desligamento no AD.',
    background: '#1e293b',
    color: '#fff',
    allowOutsideClick: false,
    heightAuto: false,      
    scrollbarPadding: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const response = await fetch(`/api/users/${username}/disable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json();

    if (data.success) {
      await Swal.fire({
        icon: 'success',
        title: 'Desligado!',
        text: 'O usuário foi processado e movido para Desativados.',
        background: '#1e293b',
        color: '#fff',
        heightAuto: false,      
        scrollbarPadding: false
      });
      await refreshAfterUserAction();
      closeModal();
    } else {
      throw new Error(data.error || 'Erro desconhecido');
    }
  } catch (error) {
    Swal.fire({
      icon: 'error',
      title: 'Falha no Desligamento',
      text: error.message,
      background: '#1e293b',
      color: '#fff',
      heightAuto: false,      
      scrollbarPadding: false
    });
  }
}
``