# PHP API

Lightweight PHP endpoints for simple integrations and hosting environments that require PHP.

## Files

- `config.php` — PDO connection using environment variables (no secrets in code)
- `cors.php` — Standard CORS headers + OPTIONS handling
- `room-types.php` — Example endpoint that returns room types as JSON from MySQL
- `schema.sql` — Minimal schema for `room_types` table
- `.env.example` — Example environment variable settings for local/dev

## Environment variables

Copy `.env.example` to `.env` and set values (if using Apache/Nginx with `SetEnv`, you can also configure these at the server level instead of a `.env` file):

```
DB_HOST=localhost
DB_PORT=3306
DB_NAME=your_database
DB_USER=your_username
DB_PASS=your_password
DB_CHARSET=utf8mb4
```

## Run locally (PHP CLI)

From this `php-api` folder:

```bat
php -S localhost:8088
```

Then open:

- http://localhost:8088/room-types.php

## Notes

- This API is intentionally minimal. Update queries/columns to match your actual schema.
- For production, ensure appropriate CORS restrictions and authentication.
