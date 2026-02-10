export async function loadUserProfile() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) throw new Error('Erro ao carregar perfil');

    const user = await res.json();

    const profileName = document.getElementById('profile-name');
    const profileRole = document.getElementById('profile-role');
    const profileInitial = document.getElementById('profile-initial');

    if (profileName) profileName.innerText = user.displayName;
    if (profileRole) profileRole.innerText = 'Administrador Conectado';
    if (profileInitial) profileInitial.innerText = user.displayName.charAt(0).toUpperCase();
  } catch (e) {
    console.error("Não logado, redirecionando...", e);
    window.location.href = '/html/login.html';
  }
}