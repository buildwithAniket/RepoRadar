// ─── Theme Management ───
const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function getActiveTheme() {
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit === 'dark' || explicit === 'light') return explicit;
  return systemDarkQuery.matches ? 'dark' : 'light';
}

function applyTheme(theme, save = true) {
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.content = theme;
  const themeBtn = document.getElementById('theme-btn');
  if (themeBtn) {
    themeBtn.textContent = theme === 'dark' ? 'INVERT LIGHT' : 'INVERT DARK';
    themeBtn.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
  }
  if (save) {
    try { localStorage.setItem('reporadar-theme', theme); } catch (e) {}
  }
}

export function initTheme({ announce }) {
  // Initialize button text & state based on active theme
  const initialTheme = getActiveTheme();
  applyTheme(initialTheme, false);

  const themeBtn = document.getElementById('theme-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const current = getActiveTheme();
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next, true);
      announce(`Color scheme changed to ${next} mode`);
    });
  }

  // React to system OS color scheme changes if user hasn't explicitly set a preference
  systemDarkQuery.addEventListener('change', (e) => {
    if (!localStorage.getItem('reporadar-theme')) {
      applyTheme(e.matches ? 'dark' : 'light', false);
    }
  });
}
