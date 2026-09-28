import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  zip: {
    excludeSources: ['docs/**', 'store/**'],
  },
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'ru',
    homepage_url: 'https://github.com/sibamor/Wingman',
    permissions: ['storage', 'alarms', 'notifications'],
    host_permissions: ['https://funpay.com/*'],
    optional_host_permissions: ['https://api.telegram.org/*'],
    action: { default_title: 'Wingman' },
    web_accessible_resources: [{ resources: ['brand/*', 'banks/*'], matches: ['https://funpay.com/*'] }],
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'wingman@wingmanfp.com',
          strict_min_version: '140.0',
          data_collection_permissions: { required: ['none'], optional: ['personalCommunications', 'personallyIdentifyingInfo', 'websiteContent'] },
        },
        gecko_android: { strict_min_version: '142.0' },
      },
    }),
  }),
});
