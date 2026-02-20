// Carrega dados do usuário logado a partir da rota /api/me
export async function loadUserProfile() {
  try {
    // Requisição ao backend para obter informações do usuário autenticado
    const res = await fetch('/api/me');
    if (!res.ok) throw new Error('Erro ao carregar perfil');

    // Dados do usuário retornados pelo servidor
    const user = await res.json();

    // Obtém elementos do header/perfil
    const profileName = document.getElementById('profile-name');
    const profileRole = document.getElementById('profile-role');
    const profileInitial = document.getElementById('profile-initial');

    // Preenche UI com informações básicas
    if (profileName) profileName.innerText = user.displayName;
    if (profileRole) profileRole.innerText = 'Administrador Conectado';
    if (profileInitial) profileInitial.innerText = user.displayName.charAt(0).toUpperCase();

  } catch (e) {
    // Caso erro / sem autenticação → redireciona para login
    console.error("Não logado, redirecionando...", e);
    window.location.href = '/html/login.html';
  }
}