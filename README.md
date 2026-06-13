# Restobar

## Local run

1. Install dependencies:
   - `npm install`
2. Start PostgreSQL (Docker):
   - `docker compose up -d`
3. Copy environment file:
   - `copy .env.example .env`
4. Start app:
   - `npm run dev`
5. Open:
   - `http://localhost:3000`

## Deployment (production)

The public site runs on **[Railway](https://railway.app/)**: start command `npm start` (runs `server.js`). In the Railway service, set environment variables (at minimum `DATABASE_URL` from the Railway Postgres plugin or an external URL; copy the rest from `.env.example` as needed). The app enables TLS for hosted Postgres URLs such as `*.railway.app` (see `src/db.js`).

The `api/` folder is an optional **serverless** wrapper (`serverless-http`) for hosts like Vercel; it is not required for Railway.

## API

- `GET /api/health` - health check
- `GET /api/menu` - menu from `menu-data.js`
- `GET /api/reviews` - approved guest reviews from the site
- `POST /api/reviews` - submit a review (moderation required)
- `POST /api/order` - create order, store to DB, send to iiko adapter

## iiko integration

Copy `.env.example` to `.env` and adjust variables.

| Variable | Purpose |
|----------|---------|
| `IIKO_STUB_MODE` | `true` = no real API calls |
| `IIKO_API_BASE` | Cloud API host (RU default: `https://api-ru.iiko.services`) |
| `IIKO_API_LOGIN` | API login key from iiko (not the URL) |
| `IIKO_ORGANIZATION_ID` | Organization UUID |
| `IIKO_TERMINAL_GROUP_ID` | Terminal group for orders (required when going live) |
| `IIKO_ORDER_TYPE_DELIVERY` | Order type: restaurant courier delivery |
| `IIKO_ORDER_TYPE_SBERMARKET_PICKUP` | Order type: SberMarket pickup (optional on site) |
| `IIKO_PAYMENT_TYPE_ID` | Payment type UUID |
| `IIKO_PAYMENT_TYPE_KIND` | `Cash`, `Card`, etc. (default `Cash`) |
| `IIKO_DELIVERY_CITY` | City for delivery address (default `Оренбург`) |
| `IIKO_DEFAULT_LAT` / `IIKO_DEFAULT_LON` | Fallback coordinates for delivery point |
| `IIKO_EXTERNAL_MENU_ID` | External menu id |
| `IIKO_PRICE_CATEGORY_ID` | Price category UUID |

### Live iiko flow

1. Set env vars (at minimum `IIKO_API_LOGIN`, `IIKO_ORGANIZATION_ID`, `IIKO_TERMINAL_GROUP_ID`, `IIKO_PAYMENT_TYPE_ID`).
2. Check connection: `node scripts/check-iiko.js`
3. Map site dishes to iiko products: `node scripts/sync-iiko-menu-ids.js` (or set `iiko product UUID` in admin for each dish).
4. Optional: map modifier UUIDs in `menu-modifiers-presets.js` → `IIKO_MODIFIER_PRODUCT_IDS` (use `node scripts/list-iiko-nomenclature.js бекон`).
5. Set `IIKO_STUB_MODE=false` on Railway and redeploy.
6. Place a test order; check `integration_logs` and iikoOffice.

Current modes:

- `IIKO_STUB_MODE=true` — fake successful response (default)
- `IIKO_STUB_MODE=false` — real `/api/1/deliveries/create` with command status polling

Implementation: `src/iiko-api.js`, `src/iiko-order-builder.js`, `src/iiko-client.js`.
