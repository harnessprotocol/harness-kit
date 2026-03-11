/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: [
    'faq',
    {
      type: 'category',
      label: 'Getting Started',
      items: [
        'getting-started/installation',
        'getting-started/quick-start',
      ],
      collapsed: false,
    },
    {
      type: 'category',
      label: 'Plugins',
      items: [
        'plugins/overview',
        'plugins/research',
        'plugins/explain',
        'plugins/data-lineage',
        'plugins/orient',
        'plugins/capture-session',
        'plugins/review',
        'plugins/docgen',
      ],
      collapsed: false,
    },
    {
      type: 'category',
      label: 'Evals',
      items: [
        'evals/compatibility',
        'guides/writing-evals',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      items: [
        'guides/creating-plugins',
        'guides/secrets-management',
        'guides/conventions',
        'guides/contributing',
        'guides/resources',
      ],
    },
    {
      type: 'category',
      label: 'Cross-Harness',
      items: [
        'cross-harness/setup-guide',
        'cross-harness/concept-mapping',
        'cross-harness/ide-support',
      ],
    },
    {
      type: 'category',
      label: 'Concepts',
      items: [
        'concepts/architecture',
        'concepts/plugins-vs-skills',
        'concepts/secrets-management',
        'concepts/cross-harness-portability',
        'concepts/comparison',
        'concepts/harness-protocol',
      ],
    },
  ],
};

module.exports = sidebars;
