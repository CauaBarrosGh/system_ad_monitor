import { closeModal } from "../ui/modal.js";
import { refreshAfterUserAction } from "./sectionLoader.js";

// DESBLOQUEIO
export async function unlockUserAccount(username) {
  // Confirmação via SweetAlert antes de chamar a API
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

  // Loading visual durante o processamento
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
    // Chamada à API para desbloquear a conta
    const res = await fetch(`/api/users/${username}/unlock`, { method: 'POST' });

    if (res.ok) {
      // Feedback de sucesso e atualização da UI
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

      closeModal();                 // Fecha modal do usuário
      await refreshAfterUserAction(); // Recarrega a aba ativa (dados atualizados)
    } else {
      // Erro retornado pela API
      const err = await res.json();
      throw new Error(err.error || 'Falha ao desbloquear');
    }

  } catch (error) {
    // Tratamento de erro (rede/API)
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
  // Confirmação detalhada do desligamento (mostra as etapas)
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

  // Loading visual durante o processo de desligamento
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
    // Chamada à API que executa o desligamento do usuário
    const response = await fetch(`/api/users/${username}/disable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json();

    if (data.success) {
      // Feedback de sucesso e refresh da interface
      await Swal.fire({
        icon: 'success',
        title: 'Desligado!',
        text: 'O usuário foi processado e movido para Desativados.',
        background: '#1e293b',
        color: '#fff',
        heightAuto: false,      
        scrollbarPadding: false
      });
      await refreshAfterUserAction(); // Atualiza dados e visões
      closeModal();                   // Fecha modal do usuário
    } else {
      // Erro retornado pela API
      throw new Error(data.error || 'Erro desconhecido');
    }
  } catch (error) {
    // Tratamento de erro (rede/API)
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