# Simple database creation script that finds the correct psql.exe
# Run as Administrator

Write-Host "Finding PostgreSQL installation..." -ForegroundColor Cyan

# Find PostgreSQL psql.exe
$psqlPath = $null
$pgVersions = @("16", "15", "14", "13", "12")

foreach ($version in $pgVersions) {
    $testPath = "C:\Program Files\PostgreSQL\$version\bin\psql.exe"
    if (Test-Path $testPath) {
        $psqlPath = $testPath
        Write-Host "Found PostgreSQL $version at: $testPath" -ForegroundColor Green
        break
    }
}

if (-not $psqlPath) {
    Write-Host "ERROR: PostgreSQL not found!" -ForegroundColor Red
    Write-Host "Please install PostgreSQL first or use SQL Shell from Start Menu" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Alternative: Open 'SQL Shell (psql)' from Start Menu and run:" -ForegroundColor Cyan
    Write-Host "  CREATE DATABASE billing_db;" -ForegroundColor White
    Write-Host "  CREATE USER billing_user WITH PASSWORD 'SecurePassword123';" -ForegroundColor White
    Write-Host "  GRANT ALL PRIVILEGES ON DATABASE billing_db TO billing_user;" -ForegroundColor White
    Write-Host "  \c billing_db" -ForegroundColor White
    Write-Host "  GRANT ALL ON SCHEMA public TO billing_user;" -ForegroundColor White
    exit 1
}

Write-Host ""
Write-Host "Enter password for postgres user:" -ForegroundColor Yellow
$password = Read-Host -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
$passwordPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

$env:PGPASSWORD = $passwordPlain

Write-Host ""
Write-Host "Creating database..." -ForegroundColor Yellow

# Create database
$output = & $psqlPath -U postgres -h localhost -c "CREATE DATABASE billing_db;" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  Database 'billing_db' created" -ForegroundColor Green
} else {
    if ($output -like "*already exists*") {
        Write-Host "  Database already exists (OK)" -ForegroundColor Yellow
    } else {
        Write-Host "  Error: $output" -ForegroundColor Red
    }
}

# Create user
$output = & $psqlPath -U postgres -h localhost -c "CREATE USER billing_user WITH PASSWORD 'SecurePassword123';" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  User 'billing_user' created" -ForegroundColor Green
} else {
    if ($output -like "*already exists*") {
        Write-Host "  User already exists (OK)" -ForegroundColor Yellow
    } else {
        Write-Host "  Error: $output" -ForegroundColor Red
    }
}

# Grant privileges on database
& $psqlPath -U postgres -h localhost -c "GRANT ALL PRIVILEGES ON DATABASE billing_db TO billing_user;" 2>&1 | Out-Null
Write-Host "  Privileges granted on database" -ForegroundColor Green

# Connect to billing_db and grant schema privileges
& $psqlPath -U postgres -h localhost -d billing_db -c "GRANT ALL ON SCHEMA public TO billing_user;" 2>&1 | Out-Null
Write-Host "  Privileges granted on schema" -ForegroundColor Green

& $psqlPath -U postgres -h localhost -d billing_db -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO billing_user;" 2>&1 | Out-Null
& $psqlPath -U postgres -h localhost -d billing_db -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO billing_user;" 2>&1 | Out-Null
Write-Host "  Default privileges set" -ForegroundColor Green

Write-Host ""
Write-Host "SUCCESS! Database setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Database credentials:" -ForegroundColor Cyan
Write-Host "  Host: localhost"
Write-Host "  Port: 5432"
Write-Host "  Database: billing_db"
Write-Host "  User: billing_user"
Write-Host "  Password: SecurePassword123"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Create .env file with these credentials"
Write-Host "  2. Run: npm run migrate"
Write-Host "  3. Run: npm run dev"
Write-Host ""

# Clean up
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue

Read-Host "Press Enter to exit"

