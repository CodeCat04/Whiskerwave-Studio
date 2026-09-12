[CmdletBinding()]
param([switch]$ModelsOnly)

. (Join-Path $PSScriptRoot "common.ps1")

try {
    Clear-Host
    Write-Host "Whiskerwave Studio installer" -ForegroundColor Magenta
    Write-Host "Local YuE2 generation, Ollama songwriting, and music transcription."
    Write-Host ""
    Write-Host "Requirements: 64-bit Windows, an NVIDIA RTX GPU, a recent NVIDIA driver,"
    Write-Host "internet access, and substantial free disk space. Downloads can be resumed."

    $yue2 = "none"
    $sheet = $false
    $installOllama = $false

    if ($ModelsOnly) {
        Write-Host ""
        Write-Host "1. YuE2 Q8 (recommended, about 4.3 GB + VAE)"
        Write-Host "2. YuE2 Q4 (compact, about 2.7 GB + VAE)"
        Write-Host "3. YuE2 BF16 (maximum fidelity, about 7.3 GB + VAE)"
        Write-Host "4. Every YuE2 precision"
        Write-Host "5. SheetSage2 + MERT transcription"
        Write-Host "6. Recommended YuE2 Q8 + SheetSage2"
        Write-Host "0. Exit"
        $choice = Read-MenuChoice "Choose a download" @("0", "1", "2", "3", "4", "5", "6")
        if ($choice -eq "0") { exit 0 }
        if ($choice -eq "1") { $yue2 = "q8" }
        if ($choice -eq "2") { $yue2 = "q4" }
        if ($choice -eq "3") { $yue2 = "bf16" }
        if ($choice -eq "4") { $yue2 = "all" }
        if ($choice -eq "5") { $sheet = $true }
        if ($choice -eq "6") { $yue2 = "q8"; $sheet = $true }
    }
    else {
        Write-Host ""
        Write-Host "1. Recommended - YuE2 Q8 + SheetSage2 (best default)"
        Write-Host "2. Compact - YuE2 Q4 generation only"
        Write-Host "3. Complete - all YuE2 models + SheetSage2"
        Write-Host "4. Custom - choose each component"
        Write-Host "0. Exit"
        $choice = Read-MenuChoice "Choose an installation" @("0", "1", "2", "3", "4")
        if ($choice -eq "0") { exit 0 }
        if ($choice -eq "1") { $yue2 = "q8"; $sheet = $true }
        if ($choice -eq "2") { $yue2 = "q4" }
        if ($choice -eq "3") { $yue2 = "all"; $sheet = $true }
        if ($choice -eq "4") {
            Write-Host ""
            Write-Host "YuE2: 1=Q8 recommended, 2=Q4 compact, 3=BF16 maximum, 4=all"
            $modelChoice = Read-MenuChoice "Choose YuE2 precision" @("1", "2", "3", "4")
            $yue2 = @{"1"="q8"; "2"="q4"; "3"="bf16"; "4"="all"}[$modelChoice]
            $sheet = (Read-MenuChoice "Install SheetSage2 transcription? 1=yes, 2=no" @("1", "2")) -eq "1"
        }
        if (-not (Test-Command "ollama")) {
            $installOllama = (Read-MenuChoice "Install optional Ollama for the Lyric Assistant? 1=yes, 2=no" @("1", "2")) -eq "1"
        }
    }

    Write-Host ""
    Write-Host "Selected: YuE2=$yue2; SheetSage2=$sheet; Ollama=$installOllama" -ForegroundColor Green
    $confirm = Read-MenuChoice "Continue? 1=yes, 2=no" @("1", "2")
    if ($confirm -ne "1") { exit 0 }

    # PowerShell unwraps zero or one pipeline results by default. Keep this an
    # array so the all-prerequisites-present case has a reliable Count of zero.
    $missing = @(Get-MissingPrerequisites -NeedsFfmpeg $sheet)
    if ($ModelsOnly) {
        $missing = @($missing | Where-Object { $_ -in @("Python 3.11", "FFmpeg", "NVIDIA display driver / supported GPU") })
    }
    if ($missing.Count -gt 0) {
        Write-Step "Missing prerequisites"
        $missing | ForEach-Object { Write-Host "  - $_" }
        $answer = Read-MenuChoice "Use winget to install supported missing tools? 1=yes, 2=stop" @("1", "2")
        if ($answer -ne "1") { throw "Install the listed prerequisites and run this installer again." }
        Install-MissingPrerequisites $missing
        $stillMissing = @(Get-MissingPrerequisites -NeedsFfmpeg $sheet)
        if ($ModelsOnly) {
            $stillMissing = @($stillMissing | Where-Object { $_ -in @("Python 3.11", "FFmpeg", "NVIDIA display driver / supported GPU") })
        }
        if ($stillMissing.Count -gt 0) {
            throw "A prerequisite installation needs a terminal or Windows restart. Restart Windows if requested, then run this installer again. Still missing: $($stillMissing -join ', ')"
        }
    }

    if ($installOllama) {
        if (-not (Test-Command "winget")) { throw "winget is needed to install Ollama automatically." }
        Write-Step "Installing Ollama"
        Install-WingetPackage "Ollama.Ollama"
        Refresh-Path
    }

    if (-not $ModelsOnly) {
        Sync-AudioCppSource
        Build-AudioCpp
    }
    elseif (-not (Test-Path -LiteralPath $script:AudioCppRoot)) {
        throw "audio.cpp is not installed. Run Install Whiskerwave Studio.bat first."
    }

    Install-Yue2Models $yue2
    if ($sheet) { Install-SheetSage2 }

    Show-InstallStatus
    Write-Host ""
    Write-Host "Installation complete." -ForegroundColor Green
    Write-Host "Double-click Start Whiskerwave Studio.bat to launch."
}
catch {
    Write-Host ""
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
