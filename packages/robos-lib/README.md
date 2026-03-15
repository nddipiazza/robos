# robos-lib

Shared RobOS library — canonical category registry and `.desktop` file validation.

## What it does

Every RobOS application must declare two custom keys in its `.desktop` file:

| Key | Required value |
|-----|----------------|
| `X-RobOS-App` | `true` |
| `X-RobOS-Category` | one of the canonical category IDs below |

These keys are how the **RobOS App Menu** (and any other launcher) dynamically discovers and groups RobOS apps without a hardcoded list.

## Canonical categories

| ID | Label | Emoji |
|----|-------|-------|
| `Dev` | Dev | 💻 |
| `AI` | AI & Agents | 🤖 |
| `Security` | Security | 🔒 |
| `People` | People & Org | 👥 |
| `Journal` | Info & Journal | 📓 |
| `System` | System | 🖥 |
| `Internet` | Internet | 🌐 |
| `Tools` | Terminal & Code | ⚙ |

## Adding a new RobOS app

In your app's `.desktop` file add:

```ini
X-RobOS-App=true
X-RobOS-Category=Dev
```

Then validate before deploying:

```bash
npx robos-validate-desktop my-app.desktop
# or validate a whole directory:
npx robos-validate-desktop --dir /usr/local/share/applications
```

## API

```js
const {
  CATEGORIES,          // array of { id, label, emoji, order }
  validateDesktopFile, // (filePath) → { name, category, exec } | throws
  loadRobOSApps,       // (desktopDir?) → sorted app array
  groupByCategory,     // (apps) → [{ category, apps }] grouped & ordered
} = require('@robos/robos-lib');
```

## Install

```bash
pnpm install
sudo cp -r . /usr/local/share/robos/robos-lib/
```
