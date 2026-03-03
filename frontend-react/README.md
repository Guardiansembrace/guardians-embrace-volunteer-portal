# Frontend — React + TypeScript + Vite

The volunteer portal frontend built with React 19 and TypeScript.

## Setup

```bash
npm install
cp .env.example .env   # fill in API URL and Google Client ID
npm run dev             # starts at http://localhost:5173
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with HMR |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |

## Key Files

- `src/lib/api.ts` — API client (all backend calls go through here)
- `src/lib/AuthContext.tsx` — Google OAuth + JWT auth state
- `src/lib/config.ts` — Frontend config (reads `VITE_*` env vars)
- `src/pages/` — All page-level components
- `src/components/ui.tsx` — Shared UI primitives (buttons, cards, inputs, etc.)

## Environment Variables

See `.env.example` for the full list. At minimum you need:

```env
VITE_API_URL=http://localhost:8000
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```
