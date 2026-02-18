import { closeModal } from "../ui/modal.js";
import { refreshAfterUserAction } from "./sectionLoader.js";

// DESBLOQUEIO
export async function unlockUserAccount(username) {
  const result = await Swal.fire({
    title: 'DESBLOQUEAR CONTA',
    html: `Tem certeza que deseja desbloquear o usuário <b>${username}</b>?`,
    icon: 'question',
    background: '#1e293b',
    color: '#fff',
    showCancelButton: true,
    confirmButtonColor: '#3b82f6',
    cancelButtonColor: '#64748b', 
    confirmButtonText: 'Sim, desbloquear',
    cancelButtonText: 'Cancelar',
    heightAuto: false,
    scrollbarPadding: false
  });

  if (!result.isConfirmed) return;

  // Loading
  Swal.fire({
    title: 'Processando...',
    text: 'Comunicando com o Active Directory.',
    background: '#1e293b',
    color: '#fff',
    allowOutsideClick: false,
    heightAuto: false,
    scrollbarPadding: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const res = await fetch(`/api/users/${username}/unlock`, { method: 'POST' });

    if (res.ok) {
      // Sucesso
      await Swal.fire({
        icon: 'success',
        title: 'Desbloqueado!',
        text: 'O usuário agora pode fazer login novamente.',
        background: '#1e293b',
        color: '#fff',
        confirmButtonColor: '#10b981',
        heightAuto: false,
        scrollbarPadding: false
      });

      closeModal();
      await refreshAfterUserAction();
    } else {
      const err = await res.json();
      throw new Error(err.error || 'Falha ao desbloquear');
    }

  } catch (error) {
    console.error(error);
    Swal.fire({
      icon: 'error',
      title: 'Erro ao Desbloquear',
      text: error.message || 'Erro de conexão com o servidor.',
      background: '#1e293b',
      color: '#fff',
      heightAuto: false,
      scrollbarPadding: false
    });
  }
}

// DESLIGAMENTO 
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