# Notes for reviewers

Paste the block below into "Notes to reviewer" (Firefox Add-ons), "Notes for certification" (Edge Add-ons) and the reviewer notes field of Opera Add-ons. Replace the placeholders with the test account details.

```
Wingman is a seller assistant for the funpay.com marketplace. It is open source under GPL-3.0: https://github.com/sibamor/Wingman

HOW TO TEST
1. Sign in to https://funpay.com with the test account:
   login: <TEST LOGIN>
   password: <TEST PASSWORD>
2. Open https://funpay.com/wingman - this is the extension's settings page. The extension draws it with a content script on top of FunPay's 404 page, and the options page redirects there.
3. Open https://funpay.com/orders/trade (sales), https://funpay.com/chat/ (chat) and your own profile to see the added tools. The toolbar popup shows open orders, unread chats and quick switches.
Most features need a seller account with sales history; the test account has little data, so some panels will be empty.

NETWORK
- funpay.com: the same endpoints the site itself uses, with the user's existing session. Offers are raised only through FunPay's own raise endpoint and only when FunPay reports that raising is allowed.
- api.telegram.org: optional host permission, requested on the extension page telegram.html only after the user connects their own Telegram bot. On Firefox the same request asks for the optional data collection categories.
- No other hosts, no analytics, no remote code.

AUTOMATION
Auto-replies are off by default. The user writes every reply text, and turning them on asks for confirmation listing what will be sent. Built-in limits: 15 messages per 10 minutes, one reply per rule per chat per 30 minutes, pause after the user's own message.

BUILD FROM SOURCE (Firefox)
The package is built with WXT and minified; the source archive is attached.
- OS: any; the CI builds it on ubuntu-latest and it is developed on Windows 11
- Node.js 24, npm 11
- Commands:
    npm ci
    npm run zip:firefox
- Output: .output/wingman-<version>-firefox.zip (the unpacked build is in .output/firefox-mv3)
- No .env files and no environment variables are used by the build.
```
