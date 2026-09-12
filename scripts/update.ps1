. (Join-Path $PSScriptRoot "common.ps1")

try {
    Clear-Host
    Write-Host "Whiskerwave Studio updater" -ForegroundColor Magenta
    Write-Host "Close Whiskerwave Studio before continuing. Your outputs and settings are preserved."
    Write-Host ""
    Write-Host "1. Update app + tested audio.cpp runtime"
    Write-Host "2. Rebuild tested audio.cpp runtime only"
    Write-Host "3. Show installation status"
    Write-Host "0. Exit"
    $choice = Read-MenuChoice "Choose an action" @("0", "1", "2", "3")
    if ($choice -eq "0") { exit 0 }
    if ($choice -eq "3") { Show-InstallStatus; exit 0 }

    if (Get-Process -Name "audiocpp_server" -ErrorAction SilentlyContinue) {
        throw "audio.cpp is still running. Close the Whiskerwave Studio window and try again."
    }

    # Windows PowerShell 5.1 unwraps a one-item pipeline result to a scalar.
    # Force an array so StrictMode can always read Count safely.
    $missing = @(Get-MissingPrerequisites -NeedsFfmpeg $false)
    if ($missing.Count -gt 0) {
        throw "Update prerequisites are missing: $($missing -join ', '). Run the main installer to repair them."
    }

    if ($choice -eq "1") {
        if (Test-Path -LiteralPath (Join-Path $script:WhiskerRoot ".git")) {
            Write-Step "Updating Whiskerwave Studio source"
            Invoke-Checked "git" @("pull", "--ff-only") $script:WhiskerRoot
        }
        else {
            Write-Host "App source was installed from a ZIP, so it cannot self-update." -ForegroundColor Yellow
            Write-Host "Download a new release ZIP to update the app; dependencies will still be refreshed now."
        }
    }

    Sync-AudioCppSource
    Build-AudioCpp

    $venvPython = Join-Path $script:WhiskerRoot "studio\.venv-sheetsage2\Scripts\python.exe"
    if (Test-Path -LiteralPath $venvPython) {
        Write-Step "Updating pinned SheetSage2 Python packages"
        Invoke-Checked $venvPython @("-m", "pip", "install", "-r", (Join-Path $script:WhiskerRoot "requirements-sheetsage2.txt"))
    }

    Show-InstallStatus
    Write-Host ""
    Write-Host "Update complete. Models and user libraries were left in place." -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
