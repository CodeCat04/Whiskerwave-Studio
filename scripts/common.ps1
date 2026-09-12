Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:WhiskerRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$script:AudioCppRoot = Join-Path $script:WhiskerRoot "audio.cpp"

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "== $Message ==" -ForegroundColor Cyan
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter()][string[]]$Arguments = @(),
        [Parameter()][string]$WorkingDirectory = ""
    )
    Write-Host "> $FilePath $($Arguments -join ' ')" -ForegroundColor DarkGray
    if ($WorkingDirectory) { Push-Location $WorkingDirectory }
    try {
        & $FilePath @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed with exit code $LASTEXITCODE`: $FilePath"
        }
    }
    finally {
        if ($WorkingDirectory) { Pop-Location }
    }
}

function Test-NativeCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter()][string[]]$Arguments = @()
    )
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & $FilePath @Arguments 1>$null 2>$null
        return $LASTEXITCODE -eq 0
    }
    catch {
        return $false
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
}

function Read-MenuChoice {
    param(
        [Parameter(Mandatory = $true)][string]$Prompt,
        [Parameter(Mandatory = $true)][string[]]$Allowed
    )
    while ($true) {
        $answer = (Read-Host $Prompt).Trim().ToLowerInvariant()
        if ($Allowed -contains $answer) { return $answer }
        Write-Host "Choose one of: $($Allowed -join ', ')" -ForegroundColor Yellow
    }
}

function Test-Command([string]$Name) {
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Refresh-Path {
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user"
}

function Get-Python311 {
    if (Test-Command "py") {
        # Do not pipe this through Select-Object. Windows PowerShell 5.1 can
        # leave LASTEXITCODE set to -1 after stopping a native-command pipeline,
        # which makes a later prerequisite check reject a working Python.
        $paths = @(& py -3.11 -c "import sys; print(sys.executable)" 2>$null)
        $exitCode = $LASTEXITCODE
        if ($exitCode -eq 0 -and $paths.Count -gt 0 -and $paths[0]) {
            return ([string]$paths[0]).Trim()
        }
    }
    if (Test-Command "python") {
        $probes = @(& python -c "import sys; print(sys.executable if sys.version_info[:2] == (3, 11) else '')" 2>$null)
        $exitCode = $LASTEXITCODE
        if ($exitCode -eq 0 -and $probes.Count -gt 0 -and $probes[0]) {
            return ([string]$probes[0]).Trim()
        }
    }
    return ""
}

function Find-VsWhere {
    $candidate = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path -LiteralPath $candidate) { return $candidate }
    return ""
}

function Test-VsCpp {
    $vswhere = Find-VsWhere
    if (-not $vswhere) { return $false }
    $install = (& $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null | Select-Object -First 1)
    return [bool]$install
}

function Find-Ninja {
    $command = Get-Command "ninja" -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }

    $candidates = @(
        (Join-Path $env:APPDATA "Python\Python311\Scripts\ninja.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\Python\Python311\Scripts\ninja.exe"),
        (Join-Path $env:ProgramFiles "Python311\Scripts\ninja.exe"),
        (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\ninja.exe")
    )

    $vswhere = Find-VsWhere
    if ($vswhere) {
        $installations = @(& $vswhere -products * -property installationPath 2>$null)
        foreach ($installation in $installations) {
            if (-not $installation) { continue }
            $candidates += Join-Path ([string]$installation).Trim() "Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja\ninja.exe"
        }
    }

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            $directory = Split-Path -Parent $candidate
            $env:Path = "$directory;$env:Path"
            return $candidate
        }
    }
    return ""
}

function Find-Nvcc {
    $command = Get-Command "nvcc" -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $cudaRoot = Join-Path $env:ProgramFiles "NVIDIA GPU Computing Toolkit\CUDA"
    if (Test-Path -LiteralPath $cudaRoot) {
        $candidate = Get-ChildItem -LiteralPath $cudaRoot -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending |
            ForEach-Object { Join-Path $_.FullName "bin\nvcc.exe" } |
            Where-Object { Test-Path -LiteralPath $_ } |
            Select-Object -First 1
        if ($candidate) {
            $env:Path = "$(Split-Path $candidate);$env:Path"
            return $candidate
        }
    }
    return ""
}

function Install-WingetPackage {
    param(
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter()][string]$Override = ""
    )
    $arguments = @("install", "--id", $Id, "--exact", "--accept-package-agreements", "--accept-source-agreements")
    if ($Override) { $arguments += @("--override", $Override) }
    Invoke-Checked "winget" $arguments
}

function Get-MissingPrerequisites {
    param([bool]$NeedsFfmpeg = $true)
    $missing = @()
    $python311 = Get-Python311
    if (-not (Test-Command "git")) { $missing += "Git" }
    if (-not $python311) { $missing += "Python 3.11" }
    if (-not (Test-Command "cmake")) { $missing += "CMake" }
    if (-not (Find-Ninja)) { $missing += "Ninja" }
    if (-not (Test-VsCpp)) { $missing += "Visual Studio 2022 C++ Build Tools" }
    if (-not (Find-Nvcc)) { $missing += "NVIDIA CUDA Toolkit" }
    if (-not (Test-Command "nvidia-smi")) { $missing += "NVIDIA display driver / supported GPU" }
    if ($NeedsFfmpeg -and -not (Test-Command "ffmpeg")) { $missing += "FFmpeg" }
    return $missing
}

function Install-MissingPrerequisites {
    param([string[]]$Missing)
    if (-not (Test-Command "winget")) {
        throw "Windows Package Manager (winget) is required for automatic prerequisite installation. Install the missing tools manually, then rerun this installer."
    }
    if ($Missing -contains "Git") { Install-WingetPackage "Git.Git" }
    if ($Missing -contains "Python 3.11") { Install-WingetPackage "Python.Python.3.11" }
    if ($Missing -contains "CMake") { Install-WingetPackage "Kitware.CMake" }
    if ($Missing -contains "Ninja") { Install-WingetPackage "Ninja-build.Ninja" }
    if ($Missing -contains "Visual Studio 2022 C++ Build Tools") {
        Install-WingetPackage "Microsoft.VisualStudio.2022.BuildTools" "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
    }
    if ($Missing -contains "NVIDIA CUDA Toolkit") { Install-WingetPackage "Nvidia.CUDA" }
    if ($Missing -contains "FFmpeg") { Install-WingetPackage "Gyan.FFmpeg" }
    Refresh-Path
}

function Sync-AudioCppSource {
    if (-not (Test-Path -LiteralPath $script:AudioCppRoot)) {
        Write-Step "Downloading audio.cpp source"
        Invoke-Checked "git" @("clone", "--filter=blob:none", "--branch", "dev", "https://github.com/0xShug0/audio.cpp.git", $script:AudioCppRoot)
    }
    if (-not (Test-Path -LiteralPath (Join-Path $script:AudioCppRoot ".git"))) {
        throw "The audio.cpp folder exists but is not an audio.cpp Git checkout. Rename or remove it, then rerun the installer."
    }

    $revision = (Get-Content -Raw (Join-Path $script:WhiskerRoot "AUDIOCPP_REVISION.txt")).Trim()
    Write-Step "Selecting tested audio.cpp revision $($revision.Substring(0, 7))"

    Push-Location $script:AudioCppRoot
    try {
        if (-not (Test-NativeCommand "git" @("cat-file", "-e", "$revision`^{commit}"))) {
            Invoke-Checked "git" @("fetch", "origin", "dev")
        }
        Invoke-Checked "git" @("checkout", "--detach", $revision)
    }
    finally { Pop-Location }
}

function Build-AudioCpp {
    Write-Step "Building the audio.cpp CUDA server and CLI"
    $buildScript = Join-Path $script:AudioCppRoot "scripts\build_windows.ps1"
    $jobs = [Math]::Max(1, [Math]::Min(16, [Environment]::ProcessorCount))
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $buildScript -Preset windows-cuda-release -Target audiocpp_server -ModelSet custom -Models yue2 -Jobs $jobs
    if ($LASTEXITCODE -ne 0) { throw "audio.cpp server build failed." }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $buildScript -Preset windows-cuda-release -Target audiocpp_cli -ModelSet custom -Models yue2 -Jobs $jobs
    if ($LASTEXITCODE -ne 0) { throw "audio.cpp CLI build failed." }
}

function Install-Yue2Models {
    param([string]$Profile)
    if ($Profile -eq "none") { return }
    Write-Step "Downloading YuE2 $Profile model files"
    $python = Get-Python311
    Invoke-Checked $python @((Join-Path $script:WhiskerRoot "scripts\download_models.py"), "--root", $script:WhiskerRoot, "--yue2", $Profile)
}

function Install-SheetSage2 {
    Write-Step "Creating the isolated SheetSage2 environment"
    $python = Get-Python311
    $venv = Join-Path $script:WhiskerRoot "studio\.venv-sheetsage2"
    $venvPython = Join-Path $venv "Scripts\python.exe"
    if (-not (Test-Path -LiteralPath $venvPython)) {
        Invoke-Checked $python @("-m", "venv", $venv)
    }
    Invoke-Checked $venvPython @("-m", "pip", "install", "--upgrade", "pip")
    Invoke-Checked $venvPython @("-m", "pip", "install", "torch==2.8.0", "torchaudio==2.8.0", "--index-url", "https://download.pytorch.org/whl/cu128")
    Invoke-Checked $venvPython @("-m", "pip", "install", "-r", (Join-Path $script:WhiskerRoot "requirements-sheetsage2.txt"))
    Write-Step "Downloading SheetSage2 and MERT-v2-FullSong"
    Invoke-Checked $venvPython @((Join-Path $script:WhiskerRoot "studio\install_sheetsage2.py"))
}

function Show-InstallStatus {
    $bin = Join-Path $script:AudioCppRoot "build\windows-cuda-release\bin"
    $models = Join-Path $script:AudioCppRoot "models"
    Write-Step "Installation status"
    $checks = [ordered]@{
        "audio.cpp server" = (Join-Path $bin "audiocpp_server.exe")
        "audio.cpp CLI" = (Join-Path $bin "audiocpp_cli.exe")
        "YuE2 Q4" = (Join-Path $models "Yue2-3B-GGUF\yue2-3b-q4_0.gguf")
        "YuE2 Q8" = (Join-Path $models "Yue2-3B-GGUF\yue2-3b-q8_0.gguf")
        "YuE2 BF16" = (Join-Path $models "Yue2-3B-GGUF\yue2-3b-bf16.gguf")
        "SheetSage2" = (Join-Path $models "SheetSage2\model.safetensors")
        "MERT-v2-FullSong" = (Join-Path $models "MERT-v2-FullSong\model.safetensors")
    }
    foreach ($item in $checks.GetEnumerator()) {
        $mark = if (Test-Path -LiteralPath $item.Value) { "READY" } else { "not installed" }
        Write-Host ("  {0,-24} {1}" -f $item.Key, $mark)
    }
}
