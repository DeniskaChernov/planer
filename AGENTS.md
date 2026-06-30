# Repository guidance

Before changing product behaviour, AI prompts, data entities or design, read `docs/PRODUCT_CANON.md`.

- Do not regress Founder OS into a generic todo list, Notion clone or autonomous agent.
- Prefer a complete judgement loop over adding breadth.
- Keep tenant data isolated; Finance linkage is identity-level through `external_user_id`.
- Use Soyuz Grotesk for display and Montserrat for body/small text.
- Treat mobile PWA behaviour as a primary product surface.
- Run `npm ci` and `npm run build` before publishing.
