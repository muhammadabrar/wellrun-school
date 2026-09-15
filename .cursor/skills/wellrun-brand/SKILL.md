---
name: wellrun-brand
description: Wellrun School logo and brand mark usage from the Wellrun website. Use when adding headers, nav, favicons, login screens, receipts, or any Wellrun wordmark.
---

# Wellrun brand

Logos come from the Wellrun website (`~/wellrun`). Do not invent a new wordmark or use tracked-out “WELLRUN SCHOOL” text.

## Assets

Source copies live in `packages/ui/brand/`:

| File | Use |
|---|---|
| `logo.svg` | Full wordmark + indigo asterisk. Default on paper/white. |
| `mark.svg` | Rounded indigo square, white WR + asterisk. Favicon and compact chrome. |
| `mark-light.svg` | Paper ground, ink WR, indigo asterisk. Light surfaces when a square mark is needed. |

Public copies (served as files):

- `apps/console/public/brand/` and `apps/console/public/favicon.svg`
- `apps/discover/public/brand/` and `apps/discover/public/favicon.svg`

## Component

Use `BrandLogo` from `@wellrun/ui`. Do not paste the SVG into pages.

```tsx
import { BrandLogo } from "@wellrun/ui";

<BrandLogo />           // sidebar, nav
<BrandLogo size="md" /> // login, register
<BrandLogo invert />    // dark backgrounds only
```

Wrap with a link when it should go home. Keep a product label next to or under the mark when the product must be named (School console, Discover, Platform).

## Color

- Ink `#16161d` — wordmark on light
- Indigo `#4642ff` — asterisk, mark ground, primary actions
- Paper `#f7f7f8` — page background
- Orange `#f26522` — accent only, never the logo
