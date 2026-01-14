# Quick database setup without password issues
# This script temporarily changes authentication to trust mode

Write-Host "Quick PostgreSQL Database Setup" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Find PostgreSQL data directory
$pgVersions = @("16", "15", "14", "13")
$pgDataPath = $null

foreach ($version in $pgVersions) {
    $testPath = "C:\Program Files\PostgreSQL\$version\data\pg_hba.conf"
    if (Test-Path $testPath) {
        $pgDataPath = "C:\Program Files\PostgreSQL\$version\data"
        $pgVersion = $version
        Write-Host "Found PostgreSQL $version at: $pgDataPath" -ForegroundColor Green
        break
    }
}

if (-not $pgDataPath) {
    Write-Host "ERROR: PostgreSQL installation not found" -ForegroundColor Red
    Write-Host "Please install PostgreSQL first" -ForegroundColor Red
    exit 1
}

$pgHbaPath = "$pgDataPath\pg_hba.conf"
$pgHbaBackup = "$pgDataPath\pg_hba.conf.backup"

Write-Host ""
Write-Host "Step 1: Backing up pg_hba.conf..." -ForegroundColor Yellow

# Backup current pg_hba.conf
try {
    Copy-Item $pgHbaPath $pgHbaBackup -Force
    Write-Host "Backup created: $pgHbaBackup" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Cannot backup pg_hba.conf. Run PowerShell as Administrator!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 2: Changing authentication to trust mode..." -ForegroundColor Yellow

# Read and modify pg_hba.conf
$content = Get-Content $pgHbaPath
$newContent = $content -replace 'scram-sha-256', 'trust' -replace 'md5', 'trust'
$newContent | Set-Content $pgHbaPath

Write-Host "Authentication changed to trust mode" -ForegroundColor Green

Write-Host ""
Write-Host "Step 3: Restarting PostgreSQL service..." -ForegroundColor Yellow

# Find and restart PostgreSQL service
$pgService = Get-Service -Name "*postgres*" | Select-Object -First 1

if ($pgService) {
    Restart-Service $pgService.Name
    Start-Sleep -Seconds 3
    Write-Host "PostgreSQL service restarted: $($pgService.Name)" -ForegroundColor Green
} else {
    Write-Host "WARNING: PostgreSQL service not found, trying to continue anyway..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Step 4: Creating database and user..." -ForegroundColor Yellow

# Set PGPASSWORD to empty (trust mode)
$env:PGPASSWORD = ""

try {
    # Create database
    & psql -U postgres -h localhost -c "CREATE DATABASE billing_db;" 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq $null) {
        Write-Host "  Database 'billing_db' created" -ForegroundColor Green
    } else {
        Write-Host "  Database might already exist (this is OK)" -ForegroundColor Yellow
    }

    # Create user
    & psql -U postgres -h localhost -c "CREATE USER billing_user WITH PASSWORD 'SecurePassword123';" 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq $null) {
        Write-Host "  User 'billing_user' created" -ForegroundColor Green
    } else {
        Write-Host "  User might already exist (this is OK)" -ForegroundColor Yellow
    }

    # Grant privileges on database
    & psql -U postgres -h localhost -c "GRANT ALL PRIVILEGES ON DATABASE billing_db TO billing_user;" 2>&1 | Out-Null
    Write-Host "  Privileges granted on database" -ForegroundColor Green

    # Grant privileges on schema
    & psql -U postgres -h localhost -d billing_db -c "GRANT ALL ON SCHEMA public TO billing_user;" 2>&1 | Out-Null
    Write-Host "  Privileges granted on schema" -ForegroundColor Green

    # Set default privileges
    & psql -U postgres -h localhost -d billing_db -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO billing_user;" 2>&1 | Out-Null
    & psql -U postgres -h localhost -d billing_db -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO billing_user;" 2>&1 | Out-Null
    Write-Host "  Default privileges set" -ForegroundColor Green

    Write-Host ""
    Write-Host "SUCCESS: Database setup completed!" -ForegroundColor Green

} catch {
    Write-Host "ERROR during database creation: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "Step 5: Restoring secure authentication..." -ForegroundColor Yellow

# Restore original pg_hba.conf
Copy-Item $pgHbaBackup $pgHbaPath -Force
Write-Host "Original pg_hba.conf restored" -ForegroundColor Green

# Restart service again
if ($pgService) {
    Restart-Service $pgService.Name
    Start-Sleep -Seconds 3
    Write-Host "PostgreSQL service restarted with secure authentication" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SETUP COMPLETE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Database credentials:" -ForegroundColor Cyan
Write-Host "  Host: localhost" -ForegroundColor White
Write-Host "  Port: 5432" -ForegroundColor White
Write-Host "  Database: billing_db" -ForegroundColor White
Write-Host "  User: billing_user" -ForegroundColor White
Write-Host "  Password: SecurePassword123" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Create .env file with these credentials" -ForegroundColor White
Write-Host "  2. Run: npm run migrate" -ForegroundColor White
Write-Host "  3. Run: npm run dev" -ForegroundColor White
Write-Host ""

# Clean up
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue

Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

