# Manual Database Setup (No Encoding Issues)

## Step 1: Open SQL Shell (psql)

1. Press Windows Key
2. Type: `SQL Shell` or `psql`
3. Open **SQL Shell (psql)**

## Step 2: Connect to PostgreSQL

Press Enter for all prompts (using defaults):

```
Server [localhost]: [Press Enter]
Database [postgres]: [Press Enter]
Port [5432]: [Press Enter]
Username [postgres]: [Press Enter]
Password for user postgres: [Type your postgres password]
```

## Step 3: Create Database and User

Copy and paste these commands one by one:

```sql
CREATE DATABASE billing_db;
```

```sql
CREATE USER billing_user WITH PASSWORD 'SecurePassword123';
```

```sql
GRANT ALL PRIVILEGES ON DATABASE billing_db TO billing_user;
```

```sql
\c billing_db
```

```sql
GRANT ALL ON SCHEMA public TO billing_user;
```

```sql
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO billing_user;
```

```sql
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO billing_user;
```

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO billing_user;
```

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO billing_user;
```

```sql
\q
```

## Step 4: Create .env file

Create file: `backend\.env`

```env
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=billing_db
DB_USER=billing_user
DB_PASSWORD=SecurePassword123

JWT_SECRET=my_super_secret_key_change_this_123456789
JWT_EXPIRES_IN=7d

SBIS_API_URL=https://api.sbis.ru
SBIS_CLIENT_ID=
SBIS_CLIENT_SECRET=
SBIS_ACCESS_TOKEN=
```

## Step 5: Run Migrations

In PowerShell (from backend directory):

```powershell
npm run migrate
```

You should see:

```
✓ Database connection established
✓ Database tables created
✓ Database migration completed
```

## Step 6: Start Server

```powershell
npm run dev
```

Server will start on: http://localhost:3000

## Done!

Your database is ready to use!
