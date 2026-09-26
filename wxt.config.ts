import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'Wingman для FunPay',
    description: 'Поднимает лоты на FunPay по таймеру',
    permissions: ['storage', 'alarms'],
    host_permissions: ['https://funpay.com/*'],
    action: { default_title: 'Wingman' },
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
