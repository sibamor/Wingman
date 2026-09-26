import './style.css';
import { mountSettings } from './settings';

export default defineContentScript({
  matches: ['https://funpay.com/wingman*', 'https://funpay.com/en/wingman*', 'https://funpay.com/uk/wingman*'],
  runAt: 'document_end',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const content = document.querySelector('#content');
    if (!content) {
      return;
    }
    document.title = 'Wingman / FunPay';
    content.replaceChildren();
    content.className = '';
    const ui = await createShadowRootUi(ctx, {
      name: 'wingman-settings',
      position: 'inline',
      anchor: content,
      append: 'last',
      inheritStyles: true,
      onMount: (container) => mountSettings(container),
    });
    ui.mount();
  },
});
