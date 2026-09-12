import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'BreathAway',
  tagline: 'Technical documentation for the BreathAway API backend service',
  favicon: 'img/favicon.ico',
  url: 'https://breathaway.example.com',
  baseUrl: '/docs/',
  organizationName: 'breathaway',
  projectName: 'backend-docs',
  onBrokenLinks: 'throw',

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },
  themes: [
    '@docusaurus/theme-mermaid',
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: true,
        language: ['en'],
        indexDocs: true,
        indexBlog: false,
        indexPages: false,
        docsRouteBasePath: '/',
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/', // Serve docs at root (/) instead of (/docs)
        },
        blog: false, // Turn off blog since it's a technical backend guide
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'BreathAway',
      logo: {
        alt: 'BreathAway Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'modulesSidebar',
          position: 'left',
          label: 'Modules',
        },
        {
          type: 'docSidebar',
          sidebarId: 'engineeringSidebar',
          position: 'left',
          label: 'Engineering',
        },
        {
          type: 'docSidebar',
          sidebarId: 'specSidebar',
          position: 'left',
          label: 'Spec',
        },
        {
          href: 'http://localhost:3000/api/public',
          label: 'Public Swagger UI',
          position: 'right',
        },
        {
          href: 'http://localhost:3000/api/admin',
          label: 'Admin Swagger UI',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Engineering',
          items: [
            {
              label: 'Overview',
              to: '/',
            },
            {
              label: 'Architecture',
              to: '/architecture',
            },
            {
              label: 'Database & Prisma',
              to: '/architecture/database',
            },
            {
              label: 'Deployment',
              to: '/deployment',
            },
            {
              label: 'Testing',
              to: '/testing',
            },
          ],
        },
        {
          title: 'Modules',
          items: [
            {
              label: 'Modules Map',
              to: '/modules/overview',
            },
            {
              label: 'Authentication',
              to: '/modules/auth',
            },
            {
              label: 'Matches',
              to: '/modules/matches',
            },
            {
              label: 'Credits Ledger',
              to: '/modules/credits',
            },
          ],
        },
        {
          title: 'Spec & PRDs',
          items: [
            {
              label: 'Spec Hub',
              to: '/spec/overview',
            },
            {
              label: 'PRD Template',
              to: '/spec/prd-template',
            },
            {
              label: 'Matching PRD',
              to: '/spec/features/matching-workflow',
            },
          ],
        },
        {
          title: 'Standards & API',
          items: [
            {
              label: 'Coding Standards',
              to: '/architecture#coding-standards-and-guidelines',
            },
            {
              label: 'API Conventions',
              to: '/api/conventions',
            },
            {
              label: 'Public Swagger UI',
              href: 'http://localhost:3000/api/public',
            },
            {
              label: 'Admin Swagger UI',
              href: 'http://localhost:3000/api/admin',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} BreathAway. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['typescript', 'json', 'bash', 'yaml', 'docker'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
