# Ответы для вкладки Privacy

Для Chrome Web Store и Edge Add-ons: вкладки у них устроены одинаково. Кабинеты англоязычные, поэтому ответы на английском.

## Single purpose

```
Wingman is a seller assistant for the funpay.com marketplace. It adds tools for managing offers, orders, chats and payouts directly on funpay.com pages.
```

## Permission justification

**storage**

```
Stores the user's settings, reply templates, buyer notes and a cache of the user's own sales history locally in the browser.
```

**alarms**

```
Schedules the background tasks the user turns on: raising the user's offers when FunPay allows it and checking for new orders and messages.
```

**notifications**

```
Shows desktop notifications about new orders, new messages and released funds. Each type is enabled by the user in the settings.
```

**Host permission: https://funpay.com/***

```
The extension works only on funpay.com. Content scripts add seller tools to the site's pages, and the background script calls the same funpay.com endpoints the site itself uses (raising offers, reading the user's chats and orders), with the session the user already has in the browser.
```

**Optional host permission: https://api.telegram.org/***

```
Optional and not granted at install. It is requested on a separate consent page only when the user connects their own Telegram bot, and is used solely to call the Telegram Bot API (getUpdates, sendMessage) for that bot.
```

## Remote code

```
No, I am not using remote code.
```

Весь код лежит в пакете. Скрипты не подгружаются со стороны, `eval` и `new Function` не используются.

## Data usage

Отметить (данные обрабатываются, хотя и только на устройстве, а правила Chrome требуют раскрывать и такую обработку):

- [x] Personally identifiable information - ники покупателей в заказах и чатах
- [x] Financial and payment information - суммы заказов, операции баланса, реквизиты вывода, которые показывает сам FunPay
- [x] Authentication information - токен Telegram-бота, который вводит пользователь
- [x] Personal communications - сообщения в чатах FunPay
- [x] Website content - страницы funpay.com

Не отмечать: Health information, Location, Web history, User activity.

Все три подтверждения ставим:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

Privacy policy URL:

```
https://github.com/sibamor/Wingman/blob/main/PRIVACY.md
```

## Firefox: сбор данных

В манифесте для Firefox стоит `required: ['none']` и необязательные категории `personalCommunications`, `personallyIdentifyingInfo`, `websiteContent`. Их Firefox спрашивает только на странице согласия на Telegram, вместе с доступом к api.telegram.org. Без этого согласия никакие данные браузер не покидают.
