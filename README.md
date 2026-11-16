# FuelGo Colombia — visual-only landing page

This website is a visual presentation handoff for a technician. Its main entry point is `index.html`; `app-showcase.html` contains the five HTML/CSS phone interfaces, arranged Inicio → Cupones → Código QR → Historial → Mi cuenta, with horizontal finger swipe support. Images inside the preview are inlined and do not require `assets`.

The download buttons and share controls are **visual elements only**, without working links. All APK routing, Android-version gating, Meta Pixel, first-party metrics, tracking cookies, Cloudflare Functions and worker code have been removed from this branch. A technician can implement those functions independently later.

Deploy as a plain static site: no build step. The hero uses an external Wikimedia photo; to ensure fully offline/independent hosting, replace it with a locally hosted licensed image. Site content should be reviewed for factual claims and policies before production.
