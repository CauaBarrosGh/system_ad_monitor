// Abre/fecha o menu lateral no mobile e controla a sobreposição (overlay)
export function toggleMobileMenu() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobile-overlay');
  if (!sidebar || !overlay) return; // Evita erro se elementos não existirem

  // Estado fechado é indicado pela classe de translate (Tailwind)
  const isClosed = sidebar.classList.contains('-translate-x-full');

  if (isClosed) {
    // Abre: mostra sidebar e overlay
    sidebar.classList.remove('-translate-x-full');
    overlay.classList.remove('hidden');
  } else {
    // Fecha: esconde sidebar e overlay
    sidebar.classList.add('-translate-x-full');
    overlay.classList.add('hidden');
  }
}

// Fecha automaticamente o menu ao clicar em itens de navegação no mobile
export function initMobileMenuAutoClose() {
  // Seleciona botões dentro do nav da sidebar
  const navButtons = document.querySelectorAll('aside nav button');

  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      // Só fecha automaticamente em telas menores que 1024px (breakpoint lg do Tailwind)
      if (window.innerWidth < 1024) toggleMobileMenu();
    });
  });
}