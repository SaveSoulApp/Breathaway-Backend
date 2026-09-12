import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  // Modules Tab Sidebar - Detailed documentation for all 25 domain and infrastructure modules
  modulesSidebar: [
    'modules/overview',
    {
      type: 'category',
      label: 'Core & Infrastructure Modules',
      collapsed: false,
      items: [
        'modules/firebase',
        'modules/notifications',
        'modules/health',
        'modules/pubsub',
        'modules/maintenance',
        'modules/audit',
      ],
    },
    {
      type: 'category',
      label: 'Authentication & Identities',
      collapsed: false,
      items: [
        'modules/auth',
        'modules/one-time-passwords',
        'modules/identities',
        'modules/social-identities',
        'modules/instagram',
        'modules/identity-workflows',
        'modules/devices',
      ],
    },
    {
      type: 'category',
      label: 'Users & Relationships',
      collapsed: false,
      items: [
        'modules/profiles',
        'modules/preferences',
        'modules/blocks',
        'modules/likes',
        'modules/matches',
        'modules/match-resolver',
        'modules/chats',
        'modules/reports',
      ],
    },
    {
      type: 'category',
      label: 'Credits & Monetization',
      collapsed: false,
      items: [
        'modules/credits',
        'modules/subscriptions',
        'modules/webhooks',
        'modules/admin',
      ],
    },
  ],

  // Engineering Tab Sidebar - Architecture, Database, Logging, BigQuery, Supabase, API, Deployment & Testing
  engineeringSidebar: [
    {
      type: 'category',
      label: 'Overview',
      collapsed: false,
      items: ['introduction', 'getting-started', 'folder-structure'],
    },
    {
      type: 'category',
      label: 'Architecture & Systems',
      collapsed: false,
      items: [
        'architecture',
        'architecture/database',
        'architecture/supabase-realtime',
        'architecture/logging',
        'architecture/bigquery-insights',
      ],
    },
    {
      type: 'category',
      label: 'API Reference',
      collapsed: true,
      items: ['api/overview', 'api/authentication', 'api/conventions'],
    },
    {
      type: 'category',
      label: 'Operations & Reliability',
      collapsed: false,
      items: ['deployment', 'testing', 'troubleshooting'],
    },
    {
      type: 'category',
      label: 'Reference',
      collapsed: true,
      items: ['faq', 'glossary'],
    },
  ],

  // Spec Tab Sidebar - Product specifications, PRD standards, templates, and living feature requirements
  specSidebar: [
    {
      type: 'category',
      label: 'Product Specs & PRD Standards',
      collapsed: false,
      items: ['spec/overview', 'spec/prd-template'],
    },
    {
      type: 'category',
      label: 'Feature Requirements (PRDs)',
      collapsed: false,
      items: [
        'spec/features/matching-workflow',
        'spec/features/credit-system',
        'spec/features/chat-messaging',
      ],
    },
  ],
};

export default sidebars;
