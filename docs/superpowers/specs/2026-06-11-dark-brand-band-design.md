# Dark Brand Band + Deepened Palette

## Goal
Make the existing premium UI feel more aligned with Upbuild's brand (upbuild.com): deep aubergine/near-black, bold editorial headlines, warm bronze accent — without sacrificing usability of forms, tables, and admin views.

## Scope
- CSS token changes in `public/css/style.css`
- Header markup updated across all 6 pages to a dark "brand band"
- No JS logic, API, or data model changes

## New tokens
- `--ink: #1A1422` — header band / dark surfaces
- `--purple: #4A2D6E` (deepened from `#5E328C`)
- `--purple-dark: #3A2257`
- `--accent: #C9A66B` — warm bronze, used on dark surfaces and select highlights
- `--light-purple` derives from new deeper purple (warmer tint)

## Header
- `header` becomes a dark `--ink` band, full width, sticky
- Logo displayed on dark (existing logo has transparency, renders fine on dark)
- Where `.page-header` exists, the `<h1>` and intro text move visually into/just below the band as a large display headline (Fraunces, ~32-40px, bold, light color on dark)
- `main.wide` pages (admin, mentor dashboard) keep title left-aligned in the band; narrow pages keep it centered

## Components
- Primary buttons use deepened purple
- Links/active states on dark band use `--accent` bronze instead of purple (purple disappears on dark backgrounds)
- Table header (`th`) background derives from new warmer `--light-purple`
- No structural changes to cards, badges, alerts, forms — only color token inheritance

## Out of scope
- Full dark mode for content areas (forms/tables stay light for readability)
- New imagery/icons
- Footer (none exists currently, none added)
