import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'Wingman для FunPay',
    description: 'Помощник продавца FunPay: автоподнятие, автоответы, уведомления, аналитика продаж и массовая правка лотов. Открытый код.',
    homepage_url: 'https://github.com/sibamor/Wingman',
    permissions: ['storage', 'alarms', 'notifications'],
    host_permissions: ['https://funpay.com/*', 'https://api.telegram.org/*'],
    action: { default_title: 'Wingman' },
    web_accessible_resources: [{ resources: ['brand/*', 'banks/*'], matches: ['https://funpay.com/*'] }],
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'wingman@wingmanfp.com',
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
});
