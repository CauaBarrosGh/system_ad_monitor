export function initTheme() {

  lucide.createIcons();
  const html = document.documentElement;
  const isDarkPreferred =
    localStorage.getItem('theme') === 'dark' ||
    (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);

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

function updateChartTheme(isDark) {
  if (!window.myPieChart) return;
  window.myPieChart.data.datasets[0].borderColor = isDark ? '#1e293b' : '#ffffff';
  window.myPieChart.update();
}
