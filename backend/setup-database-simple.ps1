# Simple PostgreSQL setup script without encoding issues
# Run this script after installing PostgreSQL

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "PostgreSQL Database Setup Script" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Ask for postgres password
Write-Host "Enter password for postgres user:" -ForegroundColor Yellow
$postgresPassword = Read-Host -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($postgresPassword)
$postgresPasswordPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

# Set PGPASSWORD environment variable
$env:PGPASSWORD = $postgresPasswordPlain

Write-Host ""
Write-Host "Creating database and user..." -ForegroundColor Yellow
Write-Host ""

# Test PostgreSQL connection
try {
    $testConnection = & psql -U postgres -h localhost -c "SELECT version();" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Cannot connect to PostgreSQL" -ForegroundColor Red
        Write-Host "Please check:" -ForegroundColor Red
        Write-Host "  1. PostgreSQL is installed and running" -ForegroundColor Red
        Write-Host "  2. Password is correct" -ForegroundColor Red
        exit 1
    }
    Write-Host "SUCCESS: Connected to PostgreSQL" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Connection failed: $_" -ForegroundColor Red
    exit 1
}

# Execute SQL script
Write-Host ""
Write-Host "Running SQL setup script..." -ForegroundColor Yellow

& psql -U postgres -h localhost -f setup-database.sql

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "SUCCESS: Database setup completed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Create .env file with database settings" -ForegroundColor White
    Write-Host "  2. Run migrations: npm run migrate" -ForegroundColor White
    Write-Host "  3. Start server: npm run dev" -ForegroundColor White
    Write-Host ""
    Write-Host "Example .env file content:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "DB_HOST=localhost" -ForegroundColor Gray
    Write-Host "DB_PORT=5432" -ForegroundColor Gray
    Write-Host "DB_NAME=billing_db" -ForegroundColor Gray
    Write-Host "DB_USER=billing_user" -ForegroundColor Gray
    Write-Host "DB_PASSWORD=SecurePassword123" -ForegroundColor Gray
    Write-Host "JWT_SECRET=your_secret_key_here" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "ERROR: Database setup failed" -ForegroundColor Red
    Write-Host "Check the output above for details" -ForegroundColor Red
}

# Clear password from environment
Remove-Item Env:\PGPASSWORD

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

