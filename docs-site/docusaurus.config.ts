import { themes as prismThemes } from 'prism-react-renderer'
import type { Config } from '@docusaurus/types'
import type * as Preset from '@docusaurus/preset-classic'

const config: Config = {
  title: 'TrustSend API',
  tagline: 'Documentation des APIs backend TrustSend',
  favicon: 'img/favicon.svg',

  future: {
    v4: true,
  },

  url: 'https://docs.trustsend.africa',
  baseUrl: '/',

  organizationName: 'trustsend',
  projectName: 'trustsend-api-docs',

  onBrokenLinks: 'throw',

  headTags: [
    {
      tagName: 'link',
      attributes: { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossorigin: 'anonymous',
      },
    },
  ],

  stylesheets: [
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Inter+Tight:wght@600;700&family=JetBrains+Mono:wght@400;500&display=swap',
  ],

  i18n: {
    defaultLocale: 'fr',
    locales: ['fr'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'TrustSend',
      logo: {
        alt: 'TrustSend',
        src: 'img/logo.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'apiSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: 'https://www.trustsend.africa',
          label: 'Site',
          position: 'right',
        },
        {
          href: 'https://business.trustsend.africa',
          label: 'Espace client',
          position: 'right',
          className: 'navbar__cta',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            { label: 'Introduction', to: '/' },
            { label: 'Authentification', to: '/authentication' },
            { label: 'Mobile Money', to: '/mobile-money/deposits-payouts' },
            { label: 'Erreurs', to: '/errors' },
          ],
        },
        {
          title: 'Produit',
          items: [
            { label: 'TrustSend', href: 'https://www.trustsend.africa' },
            { label: 'Espace client', href: 'https://business.trustsend.africa' },
            { label: 'Tarifs', href: 'https://www.trustsend.africa/pricing' },
          ],
        },
        {
          title: 'Support',
          items: [
            { label: 'WhatsApp', href: 'https://wa.me/243972716360' },
            { label: "Statut de l'API", href: 'https://api.trustsend.africa/health' },
          ],
        },
      ],
      copyright: `TrustSend — documentation API business, mise à jour le ${new Date().toLocaleDateString('fr-FR')}.`,
    },
    prism: {
      theme: prismThemes.oneLight,
      darkTheme: prismThemes.oneDark,
      additionalLanguages: ['bash', 'json'],
    },

    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 3,
    },

    docs: {
      sidebar: {
        hideable: true,
        autoCollapseCategories: false,
      },
    },
  } satisfies Preset.ThemeConfig,
}

export default config
