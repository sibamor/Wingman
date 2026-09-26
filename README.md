# Wingman для FunPay

Браузерное расширение для продавцов FunPay. Версия 0.1: автоподнятие лотов.

Стек: [WXT](https://wxt.dev) 0.21, TypeScript, Manifest V3, без UI-фреймворка. Одна кодовая база для Chrome, Edge, Opera, Яндекс Браузера и Firefox.

## Команды

```
npm install
npm run dev            # Chrome с расширением и перезагрузкой при правках
npm run dev:firefox
npm run build          # .output/chrome-mv3
npm run build:firefox  # .output/firefox-mv3
npm run zip            # архив для Chrome Web Store
npm run check          # проверка типов
npm test               # тесты разбора страниц FunPay
```

Поставить вручную: `chrome://extensions` - «Режим разработчика» - «Загрузить распакованное» - папка `.output/chrome-mv3`.

## Устройство

| Файл | Что делает |
|---|---|
| `entrypoints/background.ts` | Фон: таймер поднятия (`chrome.alarms`), сообщения от попапа и страницы |
| `entrypoints/funpay.content.ts` | Скрипт на funpay.com: берёт `userId` и csrf из `data-app-data` |
| `entrypoints/popup/` | Окно расширения |
| `lib/funpay.ts` | Разбор HTML и ответов FunPay, без сети |
| `lib/api.ts` | Запросы к FunPay с cookie браузера (`credentials: 'include'`) |
| `lib/raise.ts` | Цикл поднятия и расписание |
| `lib/storage.ts` | Данные в `chrome.storage` |

## Как поднимаются лоты

1. `GET /` - `userId` и `csrf-token` из `<body data-app-data>`.
2. `GET /users/<id>/` - разделы продавца из `.offer-list-title`.
3. `GET /lots/<node>/trade` - `data-game` и `data-node` кнопки `.js-lot-raise`.
4. `POST /lots/raise` (`game_id`, `node_id`, `csrf_token`). Если FunPay вернул `modal`, повтор с `node_ids[]`.
5. Следующая попытка - по `wait` из ответа или по тексту «Подождите N минут».

Разделы одной игры поднимаются одним запросом. Между запросами 2 секунды.

Официального API у FunPay нет, разметка меняется. При поломке первым делом смотреть регулярки в `lib/funpay.ts` и тесты в `tests/`.
