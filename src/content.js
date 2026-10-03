// ─────────────────────────────────────────────────────────────────────────────
// All site copy lives here. Source: Wonu_Park_Resume (June 2026).
// Facts and numbers below come straight from the resume; the prose around them
// ("problem" paragraphs, the About text) is written to give context, so reword
// anything that doesn't sound like you.
// ─────────────────────────────────────────────────────────────────────────────

import cerenceLogo from './assets/cerence-logo.png';
import mipsLogo from './assets/mips-logo.png';

// Switch sections on/off without deleting their content.
export const show = {
  projects: false, // hidden for now — set to true to bring the Projects section back
};

// ── Experience galleries ─────────────────────────────────────────────────────
// Each experience can have a `gallery`: a list of { src, caption, alt? }.
//   1. Put the photo in  public/gallery/<something>/   (e.g. public/gallery/cerence/team.jpg)
//   2. Reference it as   src: '/gallery/cerence/team.jpg'
//   3. Write the caption, and optionally `alt` (a description for screen readers;
//      it defaults to the caption) and `width` / `height` (the image's pixel size —
//      lets the page reserve the right space while the photo loads).
// The FIRST item is the cover: it's the only photo shown until the visitor clicks
// it ("Click to expand"), and the rest then drop down below it.
// `pad: true` on the cover adds a light margin of space around the image (good for
// logos; leave it off for full-bleed photos).
// `text: '…'` (instead of `src`) shows large text where a photo would normally be.
// `link: { label, href }` adds a link after the caption and makes the image
// clickable (e.g. to a PDF placed in public/gallery/…).
// An item with neither `src` nor `text` shows a labelled placeholder tile.
// To hide the gallery for a job, delete its `gallery` list.
// ─────────────────────────────────────────────────────────────────────────────

export const profile = {
  name: 'Wonu Park',
  email: 'wonupark@stanford.edu',
  github: 'https://github.com/Krispei',
  linkedin: 'https://www.linkedin.com/in/wonu-park',
  // Resume link in Contact: put the file at public/resume.pdf and set this to
  // '/resume.pdf'. Left empty, the link is hidden (so it can't 404).
  resume: '/resume.pdf',
};

export const about = {
  body: [
    'I am a Stanford University undergraduate studying physics (computational depth). I plan on pursuing a master’s in Computer Science after I graduate, focusing on artificial intelligence / machine learning.',
    'I was born in Seoul, South Korea. I lived in Carmel, Indiana, for 13 years before moving to Irvine, CA, to finish high school. I love talking about Irvine and Orange County in general: the best restaurants, the latest developments at the Spectrum, etc.',
    'When I’m not in class or building something, I like to go hiking, do digital art, and play some piano :)',
  ],
  // Photos shown under the text. Put files in public/about/ and list them here.
  photos: [
    {
      src: '/about/photo-1.jpg',
      alt: 'Wonu Park smiling at a table.',
      caption: 'Me!',
      width: 1050, height: 1400,
    },
    {
      src: '/about/photo-2.jpg',
      alt: 'Wonu Park and three friends standing under the Muir Woods National Monument sign',
      caption: 'Me and my friends at Muir Woods National Monument.',
      width: 1050, height: 1400,
    },
  ],
};

export const projects = [
  {
    id: 'gui-world-model',
    title: 'GUI world models via HTML generation',
    kicker: 'Vision-language models',
    year: '2026',
    summary:
      'Fine-tuning a vision-language model to predict what an interface looks like after an action, expressed as renderable HTML. An adaptation of Code2World.',
    problem:
      'Given a screenshot of a GUI and an action taken on it, the model has to predict the next state of the interface — not as pixels, but as HTML that can be rendered and checked. Training data for this is scarce, so a large part of the work was building and validating a dataset.',
    contribution: [
      'Fine-tuned Qwen3-VL-8B with LoRA to predict the next GUI state, as renderable HTML, from (screenshot, action) pairs.',
      'Built a data generation and validation pipeline: GPT-4o as generator, SigLIP as validator, and a GPT-4o revision loop for rejected entries.',
      'Produced a dataset of 755 (screenshot + action → next state) pairs, and evaluated against the base model with LLM-as-judge semantic evaluation.',
    ],
    metrics: [
      ['40%', 'improvement over the base model (LLM-as-judge)'],
      ['755', 'validated screenshot + action → next-state pairs'],
      ['8B', 'parameter model, fine-tuned with LoRA'],
    ],
    tech: ['Qwen3-VL-8B', 'LoRA', 'Hugging Face', 'GPT-4o', 'SigLIP'],
    links: [],
  },
];

export const experience = [
  {
    when: 'Jun 2026 – Present',
    role: 'AI/ML Intern',
    org: 'Cerence AI · Remote, Burlington, MA',
    summary:
      'I work on the machine learning behind a multi-agent voice assistant, building synthetic training data and fine-tuning models that classify and route what users ask. I also optimize those models for fast CPU inference and fit them into the live assistant pipeline. I also studied the tradeoff in GPU utilization vs. TTFT/ITL of high concurrency LLM serving.',
    tools: ['Python', 'PyTorch', "vLLM", "SFT",  'LoRA', 'ONNX Runtime', 'Synthetic data generation'],
    gallery: [
      { src: cerenceLogo, alt: 'Cerence logo', caption: 'Cerence AI Gallery', pad: true, width: 600, height: 309 }, // cover
      // a `text` item shows large text in place of a photo
      { text: 'Unfortunately, I don’t have any cool pictures. I worked at my desk at home :)' },
    ],
  },
  {
    when: 'Jun – Sep 2025',
    role: 'Research Intern',
    org: 'Molecular Imaging Program at Stanford (MIPS) · Stanford, CA',
    summary:
      'I developed machine learning tools for positron emission tomography (PET) imaging at Stanford’s Molecular Imaging Program. I built a graph neural network that classifies PET scan events and sped up the image reconstruction pipeline. I also presented a poster on using PET to study carbon dynamics in plant roots.',
    tools: ['PyTorch', 'Graph neural networks', 'NumPy'],
    gallery: [
      { src: mipsLogo, alt: 'Molecular Imaging Program at Stanford (MIPS) logo', caption: 'Molecular Imaging Program at Stanford (MIPS)', pad: true, width: 620, height: 249 }, // cover
      {
        src: '/gallery/mips/poster-session.jpg',
        alt: 'Wonu Park standing next to the Rhizo-PET research poster',
        caption: 'Presenting “Rhizo-PET: 4D PET system for analyzing carbon dynamics in the Rhizosphere”',
        width: 1600, height: 1200,
      },
      {
        src: '/gallery/mips/rhizo-pet-poster.jpg',
        alt: 'The Rhizo-PET research poster',
        caption: 'The Rhizo-PET poster',
        link: { label: 'Open the full poster (PDF)', href: '/gallery/mips/rhizo-pet-poster.pdf' },
        width: 2000, height: 1455,
      },
      {
        src: '/gallery/mips/gat-pet-final-report.jpg',
        alt: 'First page of the final report, “Graph Attention Networks for Multi-Isotope PET Random Events Correction”',
        caption: 'Final report: Graph Attention Networks for Multi-Isotope PET Random Events Correction',
        link: { label: 'Open the full report (PDF)', href: '/gallery/mips/gat-pet-final-report.pdf' },
        width: 1200, height: 1553,
      },
    ],
  },
];

export const skills = [
  { group: 'Programming languages', items: ['Python', 'C++', 'C', 'Bash'] },
  { group: 'ML & data', items: ['PyTorch', 'Hugging Face Transformers', 'LoRA', 'NumPy', 'Pandas', 'SciPy'] },
  { group: 'Inference & serving', items: ['vLLM', 'ONNX Runtime', 'AIPerf', 'nvidia-smi'] },
  { group: 'Infrastructure & tools', items: ['Git', 'Unix', 'HPC / Slurm', 'Docker', 'OpenAI SDK'] },
];
