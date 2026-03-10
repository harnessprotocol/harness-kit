// @ts-check

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Harness Kit',
  tagline: 'Your harness, everywhere.',
  favicon: 'img/favicon.svg',

  url: 'https://harnesskit.ai',
  baseUrl: '/',

  organizationName: 'siracusa5',
  projectName: 'harness-kit',

  onBrokenLinks: 'throw',

  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      /** @type {import("@easyops-cn/docusaurus-search-local").PluginOptions} */
      ({
        hashed: true,
        indexBlog: false,
      }),
    ],
  ],

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/siracusa5/harness-kit/tree/main/website/',
        },
        blog: {
          showReadingTime: true,
          editUrl: 'https://github.com/siracusa5/harness-kit/tree/main/website/',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {
        defaultMode: 'dark',
        disableSwitch: false,
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'Harness Kit',
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'docs',
            position: 'left',
            label: 'Docs',
          },
          { to: '/blog', label: 'Blog', position: 'left' },
          {
            href: 'https://github.com/siracusa5/harness-kit',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              { label: 'Getting Started', to: '/docs/getting-started/installation' },
              { label: 'Plugins', to: '/docs/plugins/overview' },
              { label: 'Guides', to: '/docs/guides/creating-plugins' },
            ],
          },
          {
            title: 'Community',
            items: [
              {
                label: 'Issues',
                href: 'https://github.com/siracusa5/harness-kit/issues',
              },
            ],
          },
          {
            title: 'More',
            items: [
              { label: 'Blog', to: '/blog' },
              {
                label: 'GitHub',
                href: 'https://github.com/siracusa5/harness-kit',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} harness-kit contributors. Apache-2.0 License.`,
      },
      prism: {
        theme: require('prism-react-renderer').themes.github,
        darkTheme: require('prism-react-renderer').themes.dracula,
        additionalLanguages: ['bash', 'json', 'yaml', 'python', 'go', 'java', 'scala'],
      },
    }),
};

module.exports = config;
