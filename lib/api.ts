import {
  FUNPAY_ORIGIN,
  parseAppData,
  parseLotSections,
  parseModalNodeIds,
  parseRaiseButton,
  parseRaiseResponse,
  parseUserName,
  type LotSection,
  type RaiseButton,
  type RaiseResponse,
  type RaiseResult,
} from './funpay';
import type { Account } from './storage';

export class NotLoggedInError extends Error {
  constructor() {
    super('Войдите в аккаунт FunPay');
  }
}

const XHR_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'X-Requested-With': 'XMLHttpRequest',
};

async function getPage(path: string): Promise<string> {
  const response = await fetch(FUNPAY_ORIGIN + path, { credentials: 'include', cache: 'no-store' });
  if (response.url.includes('/account/login')) {
    throw new NotLoggedInError();
  }
  if (!response.ok) {
    throw new Error(`FunPay ответил ${response.status}`);
  }
  return response.text();
}

export async function loadAccount(): Promise<Account> {
  const html = await getPage('/');
  const appData = parseAppData(html);
  if (!appData) {
    throw new Error('Не удалось прочитать страницу FunPay');
  }
  if (!appData.userId) {
    throw new NotLoggedInError();
  }
  return {
    userId: appData.userId,
    userName: parseUserName(html),
    csrfToken: appData.csrfToken,
    checkedAt: Date.now(),
  };
}

export async function loadLotSections(userId: number): Promise<LotSection[]> {
  return parseLotSections(await getPage(`/users/${userId}/`));
}

export async function loadRaiseButton(nodeId: string): Promise<RaiseButton | null> {
  return parseRaiseButton(await getPage(`/lots/${nodeId}/trade`));
}

async function postRaise(button: RaiseButton, csrfToken: string, nodeIds: string[] = []): Promise<RaiseResponse> {
  const body = new URLSearchParams({ game_id: button.gameId, node_id: button.nodeId, csrf_token: csrfToken });
  for (const id of nodeIds) {
    body.append('node_ids[]', id);
  }
  const response = await fetch(`${FUNPAY_ORIGIN}/lots/raise`, {
    method: 'POST',
    credentials: 'include',
    headers: { ...XHR_HEADERS, 'X-Csrf-Token': csrfToken },
    body,
  });
  return parseRaiseResponse(response.status, await response.text());
}

export async function raiseGame(button: RaiseButton, csrfToken: string): Promise<RaiseResult> {
  let response = await postRaise(button, csrfToken);
  if (response.kind === 'modal') {
    const nodeIds = parseModalNodeIds(response.modal);
    if (!nodeIds.length) {
      return { status: 'error', waitSeconds: 3600, message: 'Нет разделов для поднятия' };
    }
    response = await postRaise(button, csrfToken, nodeIds);
  }
  if (response.kind === 'modal') {
    return { status: 'error', waitSeconds: 3600, message: 'FunPay снова запросил выбор разделов' };
  }
  return response.result;
}
