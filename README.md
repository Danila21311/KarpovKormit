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

## API

- `GET /api/health` - health check
- `GET /api/menu` - menu from `menu-data.js`
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
| `IIKO_EXTERNAL_MENU_ID` | External menu id |
| `IIKO_PRICE_CATEGORY_ID` | Price category UUID |

Current implementation uses stub mode by default:

- `IIKO_STUB_MODE=true` — fake successful response
- `IIKO_STUB_MODE=false` — returns integration-not-configured until real iiko calls are implemented

Next step is to implement real requests in `src/iiko-client.js` using `src/iiko-config.js`:

- `/api/1/access_token`
- `/api/1/order/create` (and related endpoints per iiko docs)
