# SKSSF Laravel Backend

This backend mirrors the React app's current local data modules:

- Auth and users
- Loans and repayment approvals
- Portal settings
- Campaigns and donations
- Inventory (products, units, kits, transactions)

## Start

1. Install dependencies:
   - `composer install`
2. Configure `.env` database.
   - SQLite (recommended for this workspace):
   - `DB_CONNECTION=sqlite`
   - `DB_DATABASE=C:/Users/<your-user>/AppData/Local/Temp/skssf.sqlite`
3. Run migrations and seed:
   - `php artisan migrate --seed`
4. Serve API:
   - `php artisan serve`

## Default Login

- Email: `admin@skssf.org`
- Password: `admin123`

## Main API Prefix

- `/api/auth/*`
- `/api/users`
- `/api/loans`
- `/api/portal-config`
- `/api/campaigns`
- `/api/donations`
- `/api/inventory/*`

All protected routes use `Authorization: Bearer <token>`.
