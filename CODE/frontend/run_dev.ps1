$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path ".\node_modules")) {
    npm install
}
if (-not (Test-Path ".\.env.local")) {
    @"
NEXT_PUBLIC_API_URL=http://localhost:8000
"@ | Out-File -FilePath ".env.local" -Encoding utf8
    Write-Host "Created .env.local with NEXT_PUBLIC_API_URL=http://localhost:8000"
}
Write-Host "Starting Next.js on http://localhost:3000"
npm run dev
