import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'BreathAway Backend Docs',
  tagline: 'Technical documentation for the BreathAway API backend service',
  favicon: 'img/favicon.ico',
  url: 'https://breathaway.example.com',
  baseUrl: '/',
  organizationName: 'breathaway',
  projectName: 'backend-docs',
  onBrokenLinks: 'throw',

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },
  themes: ['@docusaurus/theme-mermaid'],

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
      title: 'BreathAway Backend Docs',
      logo: {
        alt: 'BreathAway Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Documentation',
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
          title: 'Docs',
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
              label: 'Modules Guide',
              to: '/modules/auth',
            },
          ],
        },
        {
          title: 'Conventions',
          items: [
            {
              label: 'Coding Standards',
              to: '/architecture#coding-standards-and-guidelines',
            },
            {
              label: 'API Conventions',
              to: '/api/conventions',
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
