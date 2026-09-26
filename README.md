# Wingman для FunPay

Браузерное расширение для продавцов FunPay. Версия 0.2: автоподнятие лотов и страница настроек на `funpay.com/wingman`.

Стек: [WXT](https://wxt.dev) 0.21, TypeScript, Manifest V3, без UI-фреймворка. Одна кодовая база для Chrome, Edge, Opera, Яндекс Браузера и Firefox.

## Команды

```
npm install
npm run dev            # Chrome с расширением и перезагрузкой при правках
npm run dev:firefox
npm run build          # .output/chrome-mv3
npm run build:firefox  # .output/firefox-mv3
npm run zip            # архив для Chrome Web Store и Edge
npm run zip:firefox    # архив и исходники для Firefox Add-ons
npm run check          # проверка типов
npm test               # тесты разбора страниц FunPay
npm run release        # новая версия 0.2.x и выпуск во все магазины
```

Поставить вручную: `chrome://extensions` - «Режим разработчика» - «Загрузить распакованное» - папка `.output/chrome-mv3`. Так установленное расширение само не обновляется.

## Устройство

| Файл | Что делает |
|---|---|
| `entrypoints/background.ts` | Фон: таймер поднятия, сообщения, установка обновлений |
| `entrypoints/funpay.content.ts` | На всех страницах FunPay: аккаунт из `data-app-data`, пункт «Wingman» в меню пользователя |
| `entrypoints/wingman.content/` | Страница настроек: заменяет 404 на `funpay.com/wingman` своим блоком в Shadow DOM |
| `entrypoints/popup/` | Окно расширения, шестерёнка открывает настройки |
| `entrypoints/options/` | «Параметры» в `chrome://extensions` ведут на `funpay.com/wingman` |
| `lib/funpay.ts` | Разбор HTML и ответов FunPay, без сети |
| `lib/api.ts` | Запросы к FunPay с cookie браузера |
| `lib/raise.ts` | Цикл поднятия, расписание, исключённые разделы |
| `lib/updates.ts` | Ручная проверка обновлений |
| `lib/storage.ts` | Данные в `chrome.storage` |

## Как поднимаются лоты

1. `GET /` - `userId` и `csrf-token` из `<body data-app-data>`.
2. `GET /users/<id>/` - разделы продавца из `.offer-list-title`.
3. `GET /lots/<node>/trade` - `data-game` и `data-node` кнопки `.js-lot-raise`.
4. `POST /lots/raise` (`game_id`, `node_id`, `csrf_token`). Если FunPay вернул `modal`, повтор с `node_ids[]`.
5. Следующая попытка - по `wait` из ответа или по тексту «Подождите N минут».

Разделы одной игры поднимаются одним запросом, между запросами 2 секунды. Разделы, с которых снята галочка на странице настроек, не трогаются.

Официального API у FunPay нет, разметка меняется. При поломке первым делом смотреть регулярки в `lib/funpay.ts` и тесты в `tests/`.

## Обновления у пользователей

Браузер сам проверяет обновления расширений из магазина раз в несколько часов. Как только новая версия скачана, Wingman дожидается конца текущего поднятия и перезапускается на ней, не дожидаясь перезапуска браузера. На странице настроек есть кнопка «Проверить».

## Выпуск версии

`npm run release` поднимает версию в `package.json`, ставит git-тег `vX.Y.Z` и пушит его. Тег запускает `.github/workflows/release.yml`:

1. проверка типов и тесты;
2. архивы для Chrome и Firefox прикладываются к GitHub Release;
3. отправка в магазины, у которых заданы секреты репозитория.

| Магазин | Секреты | Где взять |
|---|---|---|
| Chrome Web Store | `CHROME_EXTENSION_ID`, `CHROME_PUBLISHER_ID`, `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL`, `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY` | [API Chrome Web Store](https://developer.chrome.com/docs/webstore/using-api) |
| Firefox Add-ons | `FIREFOX_EXTENSION_ID` (`wingman@wingmanfp.com`), `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET` | [ключи AMO API](https://addons.mozilla.org/developers/addon/api/key/) |
| Edge Add-ons | `EDGE_PRODUCT_ID`, `EDGE_CLIENT_ID`, `EDGE_API_KEY` | [Partner Center API](https://learn.microsoft.com/microsoft-edge/extensions/update/api/using-addons-api) |

Первую публикацию в каждый магазин делают вручную через кабинет разработчика, дальше версии уходят сами. Магазин без секретов пропускается. Opera и Яндекс Браузер ставят расширения из Chrome Web Store.
