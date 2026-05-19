// @ts-check
import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: '0xWOW',
  tagline: 'Documenting my pentest journey',
  favicon: 'img/hacker.png',

  future: {
    v4: true,
  },

  url: 'https://wesam98.github.io',
baseUrl: '/W0W/',
organizationName: 'wesam98',
projectName: 'W0W',',

  organizationName: 'wesam98',
  projectName: 'my-blog',

  onBrokenLinks: 'warn',
  onBrokenAnchors: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      ({
        docs: false,
        blog: {
          routeBasePath: '/',
          showReadingTime: true,
          blogSidebarTitle: 'All posts',
          blogSidebarCount: 'ALL',
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'ignore',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    ({
      colorMode: {
        defaultMode: 'dark',
        disableSwitch: true,
      },
      navbar: {
        title: '0xWOW',
        items: [
          {
            href: 'https://github.com/wesam98',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [],
        copyright: `Copyright © ${new Date().getFullYear()} Wesam Abdelaziz`,
      },
    }),
};

export default config;
