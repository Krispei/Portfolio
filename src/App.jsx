import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import Hero from './hero/Hero.jsx';
import { profile, show } from './content.js';

const Portfolio = lazy(() => import('./sections/Portfolio.jsx'));

const LINKS = [
  ['Experience', '#experience'],
  ['Projects', '#projects'],
  ['About', '#about'],
  ['Contact', '#contact'],
  ['Resume', profile.resume], // opens the PDF in a new tab
].filter(([, href]) => href && (href !== '#projects' || show.projects));

// links that leave the page (the resume PDF) open in a new tab
const ext = (href) => (href.startsWith('#') ? {} : { target: '_blank', rel: 'noreferrer' });

export default function App() {
  const [open, setOpen] = useState(false);
  const menuBtn = useRef(null);
  const closeBtn = useRef(null);
  const wasOpen = useRef(false);

  // keyboard focus follows the menu: into it when it opens, back to the
  // menu button when it closes
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      closeBtn.current?.focus({ preventScroll: true });
    } else if (wasOpen.current) {
      wasOpen.current = false;
      menuBtn.current?.focus({ preventScroll: true });
    }
  }, [open]);

  // side menu: Esc closes it, the page behind doesn't scroll while it's open,
  // and it closes itself if the window grows past the phone breakpoint
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 721px)');
    const onChange = () => mq.matches && setOpen(false);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return (
    <>
      <header className="site-head">
        <a href="#top" className="wordmark" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0 }); }}>
          {profile.name}
        </a>
        <nav aria-label="Sections" className="site-nav">
          {LINKS.map(([label, href]) => <a key={href} href={href} {...ext(href)}>{label}</a>)}
        </nav>
        <button
          type="button"
          className="menu-btn"
          ref={menuBtn}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="side-menu"
          onClick={() => setOpen(true)}
        >
          <span /><span />
        </button>
      </header>

      {/* outside <header>: its backdrop-filter would otherwise trap position: fixed */}
      <div className={`menu-scrim ${open ? 'open' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside id="side-menu" className={`side-menu ${open ? 'open' : ''}`} aria-label="Menu" aria-hidden={!open}>
        <div className="side-menu-top">
          <span>Menu</span>
          <button type="button" className="menu-close" ref={closeBtn} aria-label="Close menu" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)}>
            <span /><span />
          </button>
        </div>
        <nav aria-label="Sections">
          {LINKS.map(([label, href]) => (
            <a key={href} href={href} {...ext(href)} tabIndex={open ? 0 : -1} onClick={() => setOpen(false)}>
              {label}
            </a>
          ))}
        </nav>
        <div className="side-menu-foot">
          <a href={`mailto:${profile.email}`} tabIndex={open ? 0 : -1}>{profile.email}</a>
        </div>
      </aside>

      <Hero />
      <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
        <Portfolio />
      </Suspense>
    </>
  );
}
