export function initTheme() {
  lucide.createIcons(); // Garante ícones atualizados ao iniciar

  const html = document.documentElement;

  // Detecta tema: prioridade -> localStorage -> preferência do sistema
  const isDarkPreferred =
    localStorage.getItem('theme') === 'dark' ||
    (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Aplica tema inicial
  if (isDarkPreferred) {
    html.classList.add('dark');
    updateThemeIcon(true);
  } else {
    html.classList.remove('dark');
    updateThemeIcon(false);
  }
}

export function toggleDarkMode() {
  const html = document.documentElement;

  // Alterna tema manualmente e persiste no localStorage
  if (html.classList.contains('dark')) {
    html.classList.remove('dark');
    localStorage.setItem('theme', 'light');
    updateThemeIcon(false);
    updateChartTheme(false);
  } else {
    html.classList.add('dark');
    localStorage.setItem('theme', 'dark');
    updateThemeIcon(true);
    updateChartTheme(true); 
  }
}

// Atualiza ícones de tema (sol / lua)
function updateThemeIcon(isDark) {
  const sun = document.getElementById('icon-sun');
  const moon = document.getElementById('icon-moon');
  if (!sun || !moon) return;

  if (isDark) {
    sun.classList.add('hidden');
    moon.classList.remove('hidden');
  } else {
    moon.classList.add('hidden');
    sun.classList.remove('hidden');
  }
}

// Sincroniza cores do gráfico com o tema atual
function updateChartTheme(isDark) {
  if (!window.myPieChart) return;
  window.myPieChart.data.datasets[0].borderColor = isDark ? '#1e293b' : '#ffffff';
  window.myPieChart.update();
}