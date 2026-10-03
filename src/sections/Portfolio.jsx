import { useEffect, useRef, useState } from 'react';
import { profile, show, about, projects, experience, skills } from '../content.js';

// one observer for every .reveal element
function useReveal() {
  const root = useRef(null);
  useEffect(() => {
    const els = root.current.querySelectorAll('.reveal');
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }),
      { rootMargin: '0px 0px -8% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return root;
}

function SectionHead({ title, id }) {
  return (
    <header className="sec-head reveal">
      <h2 id={id}>{title}</h2>
    </header>
  );
}

function About() {
  return (
    <section className="sec" aria-labelledby="about">
      <SectionHead title="About" id="about" />
      <div className="about-grid reveal">
        {about.body.map((p, i) => <p key={i} className="body">{p}</p>)}
      </div>
      {about.photos?.length > 0 && (
        <div className="about-photos reveal">
          {about.photos.map((ph) => (
            <figure key={ph.src} className="shot">
              <img src={ph.src} alt={ph.alt || ph.caption} width={ph.width} height={ph.height} loading="lazy" />
              <figcaption>{ph.caption}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}

// Photo gallery: the first item is the cover (dark overlay + "Click to expand").
// Expanding drops the rest down as a stack, with a Collapse button at the end.
// An item without `src` renders as a labelled placeholder tile, so the layout
// can be built before the photos exist.
function Shot({ g, n }) {
  if (g.text) return <div className="shot-text"><p>{g.text}</p></div>;
  return g.src ? (
    <img src={g.src} alt={g.alt || g.caption} width={g.width} height={g.height} loading="lazy" />
  ) : (
    <div className="shot-ph" role="img" aria-label={`Placeholder for photo ${n}`}>
      <span>Photo {n}</span>
    </div>
  );
}

function Caption({ g }) {
  if (!g.caption && !g.link) return null;
  return (
    <figcaption>
      {g.caption}
      {g.link && (
        <a className="shot-more" href={g.link.href} target="_blank" rel="noreferrer">{g.link.label} <span aria-hidden="true">↗</span></a>
      )}
    </figcaption>
  );
}

// the image, wrapped in a link when the item has one
function Media({ g, n }) {
  const shot = <Shot g={g} n={n} />;
  return g.link ? <a className="shot-link" href={g.link.href} target="_blank" rel="noreferrer">{shot}</a> : shot;
}

function Gallery({ items, id }) {
  const [open, setOpen] = useState(false);
  const cover = useRef(null);
  const [first, ...rest] = items;

  const collapse = () => {
    setOpen(false);
    // after collapsing from the bottom, bring the cover back into view
    cover.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  if (rest.length === 0) {
    return (
      <div className="gallery">
        <figure className="shot"><div className={`solo ${first.pad ? 'padded' : ''}`}><Media g={first} n={1} /></div><Caption g={first} /></figure>
      </div>
    );
  }

  return (
    <div className={`gallery ${open ? 'open' : ''}`}>
      <figure className="shot" ref={cover}>
        <button type="button" className={`cover-btn ${first.pad ? 'padded' : ''}`} aria-expanded={open} aria-controls={id} aria-label={open ? 'Collapse gallery' : 'Expand gallery'} onClick={() => setOpen((o) => !o)}>
          <Shot g={first} n={1} />
          <span className="cover-shade" aria-hidden="true" />
          {!open && <span className="cover-label">Click to expand</span>}
        </button>
        <Caption g={first} />
      </figure>

      <div className="gallery-more" id={id} {...(open ? {} : { inert: '' })}>
        <div className="gallery-more-clip">
          <div className="gallery-stack">
            {rest.map((g, k) => (
              <figure key={k} className="shot">
                <Media g={g} n={k + 2} />
                <Caption g={g} />
              </figure>
            ))}
            <button type="button" className="collapse-btn" onClick={collapse}>Collapse</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Project({ p, i }) {
  return (
    <article className="project">
      <div className="project-meta reveal">
        <span className="project-n">{String(i + 1).padStart(2, '0')}</span>
        <span className="project-kicker">{p.kicker}</span>
        {p.year && <span className="project-year">{p.year}</span>}
      </div>
      <div className="project-main">
        <h3 className="reveal">{p.title}</h3>
        <p className="project-summary reveal">{p.summary}</p>

        <dl className="metrics reveal">
          {p.metrics.map(([v, k]) => (
            <div key={k}><dd>{v}</dd><dt>{k}</dt></div>
          ))}
        </dl>

        <div className="project-body">
          <div className="reveal">
            <h4>Problem</h4>
            <p>{p.problem}</p>
            <h4>Contribution</h4>
            <ul>{p.contribution.map((c, j) => <li key={j}>{c}</li>)}</ul>
            <ul className="tags">{p.tech.map((t) => <li key={t}>{t}</li>)}</ul>
            <div className="links">
              {p.links.map((l) => <a key={l.label} href={l.href} target="_blank" rel="noreferrer">{l.label} <span aria-hidden="true">↗</span></a>)}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function Projects() {
  return (
    <section className="sec" aria-labelledby="projects">
      <SectionHead title="Selected projects" id="projects" />
      {projects.map((p, i) => <Project key={p.id} p={p} i={i} />)}
    </section>
  );
}

function Experience() {
  return (
    <section className="sec" aria-labelledby="experience">
      <SectionHead title="Experience" id="experience" />
      <ol className="timeline">
        {experience.map((e, ei) => (
          <li key={e.role + e.when} className="reveal">
            <div className="exp-head">
              <div className="exp-id">
                <h3>{e.role}</h3>
                <p className="org">{e.org}</p>
              </div>
              <span className="when">{e.when}</span>
            </div>
            <p className="summary">{e.summary}</p>
            <div className="tools">
              <span className="tools-label">Tools/skills</span>
              <p>{e.tools.join(' · ')}</p>
            </div>
            {e.gallery?.length > 0 && <Gallery items={e.gallery} id={`gallery-${ei}`} />}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Skills() {
  return (
    <section className="sec" aria-labelledby="skills">
      <SectionHead title="Skills" id="skills" />
      <div className="skills">
        {skills.map((s) => (
          <div key={s.group} className="reveal">
            <h3>{s.group}</h3>
            <ul>{s.items.map((it) => <li key={it}>{it}</li>)}</ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section className="sec contact" aria-labelledby="contact">
      <SectionHead title="Contact" id="contact" />
      <div className="reveal">
        <p className="lead">Get in touch about research, internships, or projects.</p>
        <a className="contact-email" href={`mailto:${profile.email}`}>{profile.email}</a>
        <ul className="contact-links">
          <li><a href={profile.github} target="_blank" rel="noreferrer">GitHub <span aria-hidden="true">↗</span></a></li>
          <li><a href={profile.linkedin} target="_blank" rel="noreferrer">LinkedIn <span aria-hidden="true">↗</span></a></li>
          {profile.resume && <li><a href={profile.resume} target="_blank" rel="noreferrer">Resume <span aria-hidden="true">↗</span></a></li>}
        </ul>
      </div>
    </section>
  );
}

export default function Portfolio() {
  const root = useReveal();
  return (
    <main ref={root} className="portfolio">
      <Experience />
      {show.projects && <Projects />}
      <Skills />
      <About />
      <Contact />
      <footer className="foot">
        <span>© {new Date().getFullYear()} {profile.name}</span>
      </footer>
    </main>
  );
}
