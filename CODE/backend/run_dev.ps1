$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".\venv\Scripts\Activate.ps1")) {
    Write-Host "Creating venv..."
    python -m venv venv
}
& .\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Write-Host "Starting uvicorn on http://127.0.0.1:8000 (cwd: $PWD)"
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
