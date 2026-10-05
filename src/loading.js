// The loading screen (#loader, static markup in index.html so it shows before
// any JS runs) stays up until the hero's first frame and the fonts are in, then
// fades out. It never stays longer than MAX_WAIT, whatever is still loading.

const MAX_WAIT = 6000;

let resolveHero;
const hero = new Promise((r) => { resolveHero = r; });

// Hero.jsx calls this once its graphic is on screen (or can't be shown)
export const markHeroReady = () => resolveHero();

export function hideLoaderWhenReady() {
  const fonts = document.fonts?.ready ?? Promise.resolve();
  const timeout = new Promise((r) => setTimeout(r, MAX_WAIT));
  Promise.race([Promise.all([hero, fonts]), timeout]).then(() => {
    document.documentElement.classList.remove('is-loading');
    window.__releaseScroll?.(); // the scroll lock set up inline in index.html
    const el = document.getElementById('loader');
    if (!el) return;
    el.classList.add('done');
    setTimeout(() => el.remove(), 600); // after the fade
  });
}
