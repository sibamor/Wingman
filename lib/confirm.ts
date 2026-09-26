export type ConfirmOptions = {
  title: string;
  text?: string;
  points?: string[];
  confirm: string;
  cancel?: string;
  danger?: boolean;
};

const STYLE = `
:host { all: initial; }
dialog {
  box-sizing: border-box;
  width: min(460px, calc(100vw - 32px));
  padding: 22px 22px 18px;
  border: 0;
  border-radius: 16px;
  background: var(--wm-bg, #fff);
  color: var(--wm-text, #1f2126);
  box-shadow: 0 18px 50px rgb(0 0 0 / 0.35);
  font: 15px/1.5 'Graphik', 'Helvetica Neue', Helvetica, Arial, sans-serif;
}
dialog::backdrop { background: rgb(0 0 0 / 0.5); }
h2 { margin: 0 0 8px; font-size: 19px; font-weight: 700; line-height: 1.3; }
p { margin: 0 0 10px; color: var(--wm-text-2, #5f6269); }
ul { margin: 0 0 12px; padding-left: 20px; }
li { margin: 2px 0; overflow-wrap: anywhere; }
.actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
button {
  min-height: 42px;
  padding: 0 18px;
  border: 0;
  border-radius: 10px;
  font: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}
.cancel { background: var(--wm-bg-3, #eef0f3); color: var(--wm-text, #1f2126); }
.ok { background: var(--wm-link, #2f78c4); color: #fff; }
.ok.danger { background: var(--wm-bad, #d93025); }
button:focus-visible { outline: 2px solid var(--wm-link, #2f78c4); outline-offset: 2px; }
`;

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    const dialog = document.createElement('dialog');
    const title = document.createElement('h2');
    title.textContent = options.title;
    dialog.append(title);
    if (options.text) {
      const text = document.createElement('p');
      text.textContent = options.text;
      dialog.append(text);
    }
    if (options.points?.length) {
      const list = document.createElement('ul');
      for (const point of options.points) {
        const item = document.createElement('li');
        item.textContent = point;
        list.append(item);
      }
      dialog.append(list);
    }
    const actions = document.createElement('div');
    actions.className = 'actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'cancel';
    cancel.textContent = options.cancel ?? 'Отмена';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = options.danger ? 'ok danger' : 'ok';
    ok.textContent = options.confirm;
    actions.append(cancel, ok);
    dialog.append(actions);
    root.append(style, dialog);
    document.body.append(host);
    let answered = false;
    const finish = (value: boolean) => {
      if (answered) {
        return;
      }
      answered = true;
      dialog.close();
      host.remove();
      resolve(value);
    };
    cancel.addEventListener('click', () => finish(false));
    ok.addEventListener('click', () => finish(true));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(false);
    });
    dialog.addEventListener('click', (event) => {
      const box = dialog.getBoundingClientRect();
      const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
      if (event.target === dialog && outside) {
        finish(false);
      }
    });
    dialog.showModal();
    cancel.focus();
  });
}
