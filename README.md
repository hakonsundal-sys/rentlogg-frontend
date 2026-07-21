# Rentlogg — frontend

React + Vite client for the [rentlogg-backend](https://github.com/hakonsundal-sys/rentlogg-backend) API.
Login-gated, role-based views (admin/manager, cleaner, customer) matching the backend's
JWT roles — no client-side role switcher, the logged-in user's role decides the view.

## Getting started

```bash
npm install
cp .env.example .env.local   # set VITE_API_URL to your backend (defaults shown point at Render)
npm run dev
```

`.env.local` (gitignored) should point `VITE_API_URL` at `http://localhost:4000` for a
locally running backend, or the deployed Render URL to develop against production data.

## Notes

- Auth token is kept in memory only (React state, not localStorage/sessionStorage) — a
  page refresh logs you out. Deliberate: see the backend README's security notes.
- The cleaner's "Simuler QR-skann" button picks a random non-`ok` site from `/sites`
  instead of using a camera, since there's no real QR scanner wired up yet.
- PDF report downloads (`/reports/sites/:id/pdf`) are fetched with the auth header and
  saved via a blob URL, since a plain `<a href>` can't attach an Authorization header.

## Deployment

Not yet deployed — build with `npm run build` and serve the `dist/` folder from
Vercel/Netlify, setting `VITE_API_URL` to the backend's public URL as a build-time env var.
