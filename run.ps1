# PicApp launcher for Windows. Double-click run.bat, or run:  .\run.ps1 [start|stop|logs|backup|restore]
#   start   build (first time / after updates) and start PicApp, then open it in the browser
#   stop    stop PicApp (your images and accounts are kept)
#   logs    show the app log (password reset links appear here when no email server is set up)
#   backup  save the database and images to the backups folder
#   restore <folder>  put a backup back (replaces the current accounts and images)
param(
    [ValidateSet('start', 'stop', 'logs', 'backup', 'restore')]
    [string]$Command = 'start',
    [string]$Folder
)

# Not 'Stop': Windows PowerShell would treat Docker's progress output on stderr as an error.
# Every docker call checks $LASTEXITCODE instead.
Set-Location -LiteralPath $PSScriptRoot

$AppUrl = 'http://localhost:3000'
$Compose = @('compose', '-f', 'docker-compose.app.yml', '--env-file', 'app.env')

function Fail([string]$Message) {
    Write-Host ''
    Write-Host $Message -ForegroundColor Red
    exit 1
}

function New-Secret {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

function Wait-ForDocker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Fail 'Docker Desktop is not installed. Install it from https://www.docker.com/products/docker-desktop/ and run PicApp again.'
    }
    docker info *> $null
    if ($LASTEXITCODE -eq 0) { return }

    $desktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (Test-Path -LiteralPath $desktop) {
        Write-Host 'Starting Docker Desktop...'
        Start-Process -FilePath $desktop
    }
    Write-Host 'Waiting for Docker to be ready (this can take a minute)...'
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 3
        docker info *> $null
        if ($LASTEXITCODE -eq 0) { return }
    }
    Fail 'Docker is not running. Open Docker Desktop, wait until it says "Engine running", and run PicApp again.'
}

function Initialize-Settings {
    if (Test-Path -LiteralPath 'app.env') { return }

    # A database from an earlier install only accepts the password in its original app.env
    docker volume inspect picapp-app_db_data *> $null
    if ($LASTEXITCODE -eq 0) {
        Fail ('app.env is missing, but PicApp data from an earlier start still exists. Put the old app.env back next to run.bat. ' +
            '(To start over and delete all PicApp accounts and images instead, run: docker compose -f docker-compose.app.yml -p picapp-app down -v)')
    }

    Write-Host 'First start: creating app.env with new random secrets...'
    $settings = Get-Content -LiteralPath 'app.env.example' -Raw
    $settings = $settings -replace '(?m)^POSTGRES_PASSWORD=.*$', "POSTGRES_PASSWORD=$(New-Secret)"
    $settings = $settings -replace '(?m)^JWT_SECRET_KEY=.*$', "JWT_SECRET_KEY=$(New-Secret)"

    Write-Host ''
    Write-Host 'Optional: paste a free Pollinations token for faster, better free images'
    Write-Host '(create one at https://enter.pollinations.ai), or just press Enter to skip.'
    $token = (Read-Host 'Pollinations token').Trim()
    if ($token) {
        # '$$' keeps a '$' in the token literal in the -replace substitution
        $settings = $settings -replace '(?m)^POLLINATIONS_TOKEN=.*$', "POLLINATIONS_TOKEN=$($token.Replace('$', '$$'))"
    }

    # UTF-8 without BOM, so Docker reads the first line correctly
    [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'app.env'), $settings, (New-Object Text.UTF8Encoding $false))
    Write-Host 'Saved app.env (keep this file: it holds your database password).'
}

Wait-ForDocker

switch ($Command) {
    'start' {
        Initialize-Settings
        Write-Host ''
        Write-Host 'Starting PicApp. The first start builds the app and can take several minutes...'
        docker @Compose up -d --build --wait
        if ($LASTEXITCODE -ne 0) {
            Fail 'PicApp could not start. Run ".\run.ps1 logs" to see why. If a port is in use, close other programs using ports 3000 or 8000.'
        }
        Write-Host ''
        Write-Host "PicApp is running at $AppUrl" -ForegroundColor Green
        Write-Host 'It keeps running in the background (even after a restart, while Docker Desktop runs).'
        Write-Host 'To stop it, run: .\run.ps1 stop'
        Start-Process $AppUrl
    }
    'stop' {
        docker @Compose down
        if ($LASTEXITCODE -ne 0) { Fail 'Could not stop PicApp.' }
        Write-Host 'PicApp stopped. Your accounts and images are kept.'
    }
    'logs' {
        docker @Compose logs --tail 200 -f
    }
    'backup' {
        $folder = Join-Path 'backups' (Get-Date -Format 'yyyy-MM-dd_HH-mm-ss')
        New-Item -ItemType Directory -Force -Path $folder | Out-Null
        docker @Compose exec -T db pg_dump -U postgres -d picapp_db --clean --if-exists -f /tmp/picapp.sql
        if ($LASTEXITCODE -ne 0) { Fail 'Backup failed: is PicApp running? Start it first.' }
        docker @Compose cp db:/tmp/picapp.sql (Join-Path $folder 'database.sql')
        docker @Compose cp backend:/app/static/generations (Join-Path $folder 'images')
        if ($LASTEXITCODE -ne 0) { Fail 'Backup of the images failed.' }
        Write-Host "Backup saved to $folder" -ForegroundColor Green
    }
    'restore' {
        if (-not $Folder -or -not (Test-Path -LiteralPath (Join-Path $Folder 'database.sql'))) {
            Fail 'Usage: run.bat restore backups\<folder>   (a folder made by "run.bat backup")'
        }
        Write-Host "This replaces all current PicApp accounts and images with the backup in $Folder."
        if ((Read-Host 'Type yes to continue') -ne 'yes') { Fail 'Restore cancelled.' }
        docker @Compose cp (Join-Path $Folder 'database.sql') db:/tmp/picapp.sql
        if ($LASTEXITCODE -ne 0) { Fail 'Restore failed: is PicApp running? Start it first.' }
        docker @Compose exec -T db psql -U postgres -d picapp_db -q -v ON_ERROR_STOP=1 -f /tmp/picapp.sql
        if ($LASTEXITCODE -ne 0) { Fail 'Restoring the database failed.' }
        $images = Join-Path $Folder 'images'
        if (Test-Path -LiteralPath $images) {
            docker @Compose cp "$images\." backend:/app/static/generations
            if ($LASTEXITCODE -ne 0) { Fail 'Restoring the images failed.' }
        }
        Write-Host 'Backup restored.' -ForegroundColor Green
    }
}
