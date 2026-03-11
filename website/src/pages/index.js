import React from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

const features = [
  {
    title: 'Install once, use everywhere',
    description:
      'Install by name. Plugins follow you across every project without manual setup.',
  },
  {
    title: 'More than prompts',
    description:
      'Each plugin encodes a complete workflow — what to gather, how to analyze it, what to produce. The command is just the entry point.',
  },
  {
    title: 'Share your setup',
    description:
      'Export your full setup as a harness.yaml. Share it with a teammate and they\'re running the same workflows. Your harness travels.',
  },
];

const plugins = [
  {
    name: 'research',
    description: 'Process any source into a structured, compounding knowledge base.',
    to: '/docs/plugins/research',
  },
  {
    name: 'explain',
    description: 'Layered explanations of files, functions, directories, or concepts.',
    to: '/docs/plugins/explain',
  },
  {
    name: 'data-lineage',
    description: 'Column-level lineage tracing through SQL, Kafka, Spark, and JDBC.',
    to: '/docs/plugins/data-lineage',
  },
  {
    name: 'orient',
    description: 'Topic-focused session orientation across graph, knowledge, and research.',
    to: '/docs/plugins/orient',
  },
  {
    name: 'capture-session',
    description: 'Capture session information into a staging file for later reflection.',
    to: '/docs/plugins/capture-session',
  },
  {
    name: 'review',
    description: 'Code review for a branch, PR, or path — severity labels and cross-file analysis.',
    to: '/docs/plugins/review',
  },
  {
    name: 'docgen',
    description: 'Generate or update README, API docs, architecture overview, or changelog.',
    to: '/docs/plugins/docgen',
  },
];

function HeroLogo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" style={{ width: 56, height: 56, marginBottom: '1rem' }}>
      <rect width="32" height="32" rx="6" fill="#0d0d12"/>
      <text x="16" y="22" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="16" fill="#8b7aff">hk</text>
    </svg>
  );
}

function Hero() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className="hero">
      <div className="container">
        <HeroLogo />
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className="hero-install">
          <code>/plugin marketplace add harnessprotocol/harness-kit</code>
        </div>
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'center', alignItems: 'center' }}>
          <Link className="button button--primary button--lg" to="/docs/getting-started/installation">
            Get Started
          </Link>
          <Link className="button button--outline button--lg" to="/docs/plugins/overview">
            Browse Plugins
          </Link>
          <Link className="button button--outline button--lg" href="https://github.com/harnessprotocol/harness-kit">
            GitHub ↗
          </Link>
        </div>
      </div>
    </header>
  );
}

function Features() {
  return (
    <section className="container">
      <div className="features">
        {features.map((f, idx) => (
          <div key={idx} className="feature">
            <h3>{f.title}</h3>
            <p>{f.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="container" style={{ paddingBottom: '2rem' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '0.25rem' }}>How it works</h2>
      <p style={{ textAlign: 'center', opacity: 0.7, marginBottom: '1.5rem' }}>
        Install a plugin, invoke a command, get a repeatable workflow.
      </p>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 310" style={{width: '100%', maxWidth: '560px', display: 'block', margin: '0 auto'}}>
        <defs>
          <marker id="ap" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto" markerUnits="userSpaceOnUse">
            <polygon points="0 0, 10 3.5, 0 7" style={{fill: 'var(--ifm-color-primary)'}} />
          </marker>
          <marker id="am" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto" markerUnits="userSpaceOnUse">
            <polygon points="0 0, 8 3, 0 6" style={{fill: 'var(--ifm-color-emphasis-300)'}} />
          </marker>
        </defs>
        <rect x="16" y="28" width="72" height="34" rx="6" style={{fill: 'var(--ifm-color-emphasis-100)', stroke: 'var(--ifm-color-primary)', strokeWidth: '1.5'}} />
        <text x="52" y="50" textAnchor="middle" style={{fontFamily: 'var(--ifm-font-family-base)', fontSize: '13px', fontWeight: '600', fill: 'var(--ifm-font-color-base)'}}>You</text>
        <line x1="88" y1="45" x2="122" y2="45" markerEnd="url(#ap)" style={{stroke: 'var(--ifm-color-primary)', strokeWidth: '1.5'}} />
        <text x="105" y="37" textAnchor="middle" style={{fontFamily: 'var(--ifm-font-family-base)', fontSize: '10px', fill: 'var(--ifm-color-primary)'}}>install</text>
        <rect x="132" y="28" width="126" height="34" rx="6" style={{fill: 'var(--ifm-color-emphasis-100)', stroke: 'var(--ifm-color-primary)', strokeWidth: '1.5'}} />
        <text x="195" y="50" textAnchor="middle" style={{fontFamily: 'var(--ifm-font-family-base)', fontSize: '13px', fontWeight: '600', fill: 'var(--ifm-font-color-base)'}}>Your Harness</text>
        <line x1="258" y1="45" x2="312" y2="45" markerEnd="url(#ap)" style={{stroke: 'var(--ifm-color-primary)', strokeWidth: '1.5'}} />
        <text x="285" y="37" textAnchor="middle" style={{fontFamily: 'var(--ifm-font-family-base)', fontSize: '10px', fill: 'var(--ifm-color-primary)'}}>fetch</text>
        <rect x="322" y="28" width="108" height="34" rx="6" style={{fill: 'var(--ifm-color-emphasis-100)', stroke: 'var(--ifm-color-primary)', strokeWidth: '1.5'}} />
        <text x="376" y="50" textAnchor="middle" style={{fontFamily: 'var(--ifm-font-family-base)', fontSize: '13px', fontWeight: '600', fill: 'var(--ifm-font-color-base)'}}>Registry</text>
        <line x1="376" y1="62" x2="287" y2="100" markerEnd="url(#ap)" style={{stroke: 'var(--ifm-color-primary)', strokeWidth: '1.5'}} />
        <text x="362" y="83" textAnchor="start" style={{fontFamily: 'var(--ifm-font-family-base)', fontSize: '10px', fill: 'var(--ifm-color-primary)'}}>downloads</text>
        <rect x="200" y="108" width="150" height="34" rx="6" style={{fill: 'var(--ifm-color-emphasis-100)', stroke: 'var(--ifm-color-primary)', strokeWidth: '1.5'}} />
        <text x="275" y="130" textAnchor="middle" style={{fontFamily: 'var(--ifm-font-family-base)', fontSize: '13px', fontWeight: '600', fill: 'var(--ifm-font-color-base)'}}>Plugin Directory</text>
        <line x1="275" y1="142" x2="72" y2="188" markerEnd="url(#am)" style={{stroke: 'var(--ifm-color-emphasis-300)', strokeWidth: '1.5'}} />
        <line x1="275" y1="142" x2="196" y2="188" markerEnd="url(#am)" style={{stroke: 'var(--ifm-color-emphasis-300)', strokeWidth: '1.5'}} />
        <line x1="275" y1="142" x2="318" y2="188" markerEnd="url(#am)" style={{stroke: 'var(--ifm-color-emphasis-300)', strokeWidth: '1.5'}} />
        <line x1="275" y1="142" x2="444" y2="188" markerEnd="url(#am)" style={{stroke: 'var(--ifm-color-emphasis-300)', strokeWidth: '1.5'}} />
        <rect x="26" y="196" width="92" height="28" rx="6" style={{fill: 'var(--ifm-color-emphasis-100)', stroke: 'var(--ifm-color-primary)', strokeWidth: '1.5'}} />
        <text x="72" y="215" textAnchor="middle" style={{fontFamily: 'var(--ifm-font-family-base)', fontSize: '12px', fontWeight: '600', fill: 'var(--ifm-font-color-base)'}}>SKILL.md</text>
        <rect x="152" y="196" width="88" height="28" rx="6" style={{fill: 'var(--ifm-color-emphasis-100)', stroke: 'var(--ifm-color-emphasis-300)', strokeWidth: '1.5'}} />
        <text x="196" y="215" textAnchor="middle" style={{fontFamily: 'var(--ifm-font-family-base)', fontSize: '12px', fill: 'var(--ifm-font-color-base)', opacity: '0.7'}}>scripts/</text>
        <rect x="278" y="196" width="80" height="28" rx="6" style={{fill: 'var(--ifm-color-emphasis-100)', stroke: 'var(--ifm-color-emphasis-300)', strokeWidth: '1.5'}} />
        <text x="318" y="215" textAnchor="middle" style={{fontFamily: 'var(--ifm-font-family-base)', fontSize: '12px', fill: 'var(--ifm-font-color-base)', opacity: '0.7'}}>hooks/</text>
        <rect x="404" y="196" width="80" height="28" rx="6" style={{fill: 'var(--ifm-color-emphasis-100)', stroke: 'var(--ifm-color-emphasis-300)', strokeWidth: '1.5'}} />
        <text x="444" y="215" textAnchor="middle" style={{fontFamily: 'var(--ifm-font-family-base)', fontSize: '12px', fill: 'var(--ifm-font-color-base)', opacity: '0.7'}}>agents/</text>
        <line x1="72" y1="224" x2="72" y2="256" markerEnd="url(#ap)" style={{stroke: 'var(--ifm-color-primary)', strokeWidth: '1.5'}} />
        <text x="86" y="244" textAnchor="start" style={{fontFamily: 'var(--ifm-font-family-base)', fontSize: '10px', fill: 'var(--ifm-color-primary)'}}>/command</text>
        <rect x="26" y="264" width="92" height="28" rx="6" style={{fill: 'var(--ifm-color-emphasis-100)', stroke: 'var(--ifm-color-primary)', strokeWidth: '1.5'}} />
        <text x="72" y="283" textAnchor="middle" style={{fontFamily: 'var(--ifm-font-family-base)', fontSize: '12px', fontWeight: '600', fill: 'var(--ifm-font-color-base)'}}>Workflow</text>
        <text x="18" y="14" style={{fontFamily: 'var(--ifm-font-family-base)', fontSize: '9px', fill: 'var(--ifm-color-emphasis-500)', letterSpacing: '0.08em'}}>LOCAL</text>
        <text x="322" y="14" style={{fontFamily: 'var(--ifm-font-family-base)', fontSize: '9px', fill: 'var(--ifm-color-emphasis-500)', letterSpacing: '0.08em'}}>REMOTE</text>
        <rect x="310" y="18" width="142" height="54" rx="8" style={{fill: 'none', stroke: 'var(--ifm-color-emphasis-300)', strokeWidth: '1', strokeDasharray: '4 3'}} />
      </svg>
      <p style={{ textAlign: 'center', marginTop: '1rem' }}>
        <a href="/docs/concepts/architecture">Learn more about the architecture →</a>
      </p>
    </section>
  );
}

function PluginShowcase() {
  return (
    <section className="container" style={{ paddingBottom: '3rem' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>{plugins.length} plugins</h2>
      <p style={{ textAlign: 'center', opacity: 0.7, marginBottom: '1.5rem' }}>
        Works with Claude Code today. Designed for portability.
      </p>
      <div className="plugin-grid">
        {plugins.map((p) => (
          <Link key={p.name} to={p.to} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="plugin-card">
              <h4><code>{p.name}</code></h4>
              <p>{p.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <Hero />
      <main>
        <Features />
        <HowItWorks />
        <PluginShowcase />
      </main>
    </Layout>
  );
}
