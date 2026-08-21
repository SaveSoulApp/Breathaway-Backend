import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    'introduction',
    'getting-started',
    'architecture',
    'architecture/supabase-realtime',
    'folder-structure',
    {
      type: 'category',
      label: 'Core & Infrastructure Modules',
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
      items: [
        'modules/credits',
        'modules/subscriptions',
        'modules/webhooks',
        'modules/admin',
      ],
    },
    {
      type: 'category',
      label: 'API References',
      items: ['api/overview', 'api/authentication', 'api/conventions'],
    },
    'deployment',
    'testing',
    'troubleshooting',
    'faq',
    'glossary',
  ],
};

export default sidebars;
