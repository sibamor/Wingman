# Как помочь Wingman

Спасибо, что хотите помочь. Обсудить идею до начала работы можно в [Discord](https://discord.gg/aKJmF8rUXJ) или в [Issues](https://github.com/sibamor/Wingman/issues).

## Сообщить об ошибке

Откройте [новую задачу](https://github.com/sibamor/Wingman/issues/new/choose) по шаблону. Больше всего помогают:

- версия Wingman (вкладка «Расширение» на `funpay.com/wingman`) и браузер;
- адрес страницы FunPay, где сломалось;
- что вы сделали, что ожидали и что получилось;
- скриншот, на котором размыты ники, суммы и номера заказов (удобно включить «Режим приватности» во вкладке «Оформление»).

Не прикладывайте cookie, `golden_key`, токены ботов и реквизиты. Уязвимости присылайте приватно, см. [SECURITY.md](SECURITY.md).

## Запуск

Нужен Node.js 24 или новее: тесты запускаются прямо из TypeScript.

```
npm install
npm run dev            # Chrome с расширением и перезагрузкой при правках
npm run dev:firefox
npm run build          # .output/chrome-mv3
npm run build:firefox  # .output/firefox-mv3
npm run check          # проверка типов
npm test               # тесты разбора страниц FunPay
```

Поставить сборку вручную: `chrome://extensions` - «Режим разработчика» - «Загрузить распакованное» - папка `.output/chrome-mv3`.

## Устройство

Стек: [WXT](https://wxt.dev) 0.21, TypeScript, Manifest V3, без UI-фреймворка. Одна кодовая база для Chrome, Edge, Opera, Яндекс Браузера и Firefox.

| Путь | Что делает |
|---|---|
| `entrypoints/background.ts` | Фон: таймеры поднятия и автоответов, сообщения от страниц, обновления |
| `entrypoints/*.content.ts` | Скрипты на страницах FunPay: чат, продажи, профиль, баланс, редактор лота, массовая правка, Ctrl+K |
| `entrypoints/wingman.content/` | Страница настроек на `funpay.com/wingman` в Shadow DOM |
| `entrypoints/popup/` | Окно расширения |
| `lib/funpay.ts`, `lib/fp-chat.ts`, `lib/fp-pages.ts` | Разбор HTML и ответов FunPay без DOM, работает и в фоне |
| `lib/rows.ts`, `lib/history.ts` | Разбор таблиц через DOM и история продаж, операций, отзывов и переписки в IndexedDB |
| `lib/raise.ts` | Цикл поднятия и расписание |
| `lib/auto.ts`, `lib/auto-rules.ts` | Автоответы, уведомления, сроки заказов, слежение за ценой, итоги дня |
| `lib/bulk-lots.ts` | Массовая правка лотов через форму редактора |
| `lib/storage.ts` | Все ключи `chrome.storage` |
| `assets/` | Стили: темы, «Улучшенный вид», приватность, стили функций |
| `tests/` | Тесты разборщиков на сохранённых страницах FunPay в `tests/fixtures/` |

Официального API у FunPay нет, разметка меняется. Если функция сломалась, первым делом смотрите разборщики в `lib/` и тесты в `tests/`.

### Как поднимаются лоты

1. `GET /` - `userId` и `csrf-token` из `<body data-app-data>`.
2. `GET /users/<id>/` - разделы продавца из `.offer-list-title`.
3. `GET /lots/<node>/trade` - `data-game` и `data-node` кнопки `.js-lot-raise`.
4. `POST /lots/raise` (`game_id`, `node_id`, `csrf_token`). Если FunPay вернул `modal`, повтор с `node_ids[]`.
5. Следующая попытка - по `wait` из ответа или по тексту «Подождите N минут».

Разделы одной игры поднимаются одним запросом, между запросами 2 секунды.

## Правила кода

- TypeScript без `any`, `npm run check` и `npm test` должны проходить.
- Код пишется так, чтобы читался без комментариев: понятные имена и короткие функции. Комментарии в код не добавляем.
- Новый разбор страницы FunPay - вместе с тестом на сохранённой странице в `tests/fixtures/`. Личные данные из неё убрать.
- Запросы к FunPay - с паузами, не чаще, чем это делал бы человек. Никаких обходов ограничений сайта.
- Никаких внешних серверов, аналитики и загрузки кода со стороны. Новое разрешение в манифесте - только с объяснением в описании изменений.
- Тексты интерфейса - по-русски, коротко, без канцелярита. Вместо длинного тире - дефис.
- Действия, которые нельзя отменить, спрашивают подтверждение через `confirmAction` из `lib/confirm.ts`.

## Изменения

1. Сделайте форк и ветку от `main`.
2. Проверьте изменение в браузере на настоящем FunPay.
3. Откройте pull request по шаблону: что изменилось, как проверено, скриншоты для видимых правок.

Отправляя изменения, вы соглашаетесь, что они распространяются под лицензией [GPL-3.0](LICENSE).

## Выпуск версии

Для сопровождающих. Перед выпуском впишите описание версии в `.github/release-notes.md`, оно станет текстом GitHub Release и новостью в Discord. `npm run release` поднимает версию в `package.json`, ставит git-тег `vX.Y.Z` и пушит его. Тег запускает `.github/workflows/release.yml`:

1. проверка типов и тесты;
2. архивы для Chrome и Firefox прикладываются к GitHub Release;
3. отправка в магазины, у которых заданы секреты репозитория.

| Магазин | Секреты | Где взять |
|---|---|---|
| Chrome Web Store | `CHROME_EXTENSION_ID`, `CHROME_PUBLISHER_ID`, `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL`, `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY` | [API Chrome Web Store](https://developer.chrome.com/docs/webstore/using-api) |
| Firefox Add-ons | `FIREFOX_EXTENSION_ID` (`wingman@wingmanfp.com`), `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET` | [ключи AMO API](https://addons.mozilla.org/developers/addon/api/key/) |
| Edge Add-ons | `EDGE_PRODUCT_ID`, `EDGE_CLIENT_ID`, `EDGE_API_KEY` | [Partner Center API](https://learn.microsoft.com/microsoft-edge/extensions/update/api/using-addons-api) |

Первую публикацию в каждый магазин делают вручную через кабинет разработчика, пошагово - в [store/README.md](store/README.md). Дальше версии уходят сами. Магазин без секретов пропускается. Opera и Яндекс Браузер ставят расширения из Chrome Web Store.
