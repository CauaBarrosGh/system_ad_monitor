export function toggleMobileMenu() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobile-overlay');
  if (!sidebar || !overlay) return;

  const isClosed = sidebar.classList.contains('-translate-x-full');

  if (isClosed) {
    sidebar.classList.remove('-translate-x-full');
    overlay.classList.remove('hidden');
  } else {
    sidebar.classList.add('-translate-x-full');
    overlay.classList.add('hidden');
  }
}

export function initMobileMenuAutoClose() {
  const navButtons = document.querySelectorAll('aside nav button');

  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (window.innerWidth < 1024) toggleMobileMenu();
    });
  });
}