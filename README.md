# CRM · Martin Tesárek

Vlastní CRM pro realitní obchody (náhrada ClickUpu) na **crm.martintesarek.cz**.

- Frontend: Vite + React 19 + TypeScript + Tailwind v4, PWA
- Backend: Supabase (projekt `crm.martintesarek`, id `aowceqpaawxeugalapgx`), RLS multi-tenant (accounts / memberships)
- Hosting: Vercel (projekt `crm-martintesarek`), produkce se nasazuje z větve `main`
- Klientský portál: veřejná stránka `/p/:token`, data přes RPC `portal_get`

## Vývoj
```
npm install
npm run dev
```
