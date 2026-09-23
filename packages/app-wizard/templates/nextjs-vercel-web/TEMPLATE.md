# RobOS template: `nextjs-vercel-web` (v1)

Production launch kit for phone-first web apps on Vercel, distilled from getemgigs.com.
Used by the App Wizard (`lib/generate-app.js`) for `robos:FrontEndApp` / Next.js / Vercel projects.

Placeholders substituted at generation time:

| Placeholder | Value | Used in |
|:---|:---|:---|
| `__APP_NAME__`, `__APP_SLUG__`, `__DOMAIN__`, `__TAGLINE__`, `__DESCRIPTION__`, `__INITIALS__` | plain text (XML-escaped in `.svg`) | markdown, llms.txt, svg, yaml |
| `__APP_NAME_JS__`, `__TAGLINE_JS__`, `__DESCRIPTION_JS__`, `__KEYWORDS_JS__`, `__INITIALS_JS__` | JSON literals | `.js`, `package.json.tmpl` |

`*.tmpl` files are written without the suffix. Existing files in the target are never overwritten.
When you improve the launch kit in a real app, port the change here and bump `TEMPLATE_VERSION`
in `lib/generate-app.js`. This file is not copied into generated apps' behaviour but is harmless if present.
