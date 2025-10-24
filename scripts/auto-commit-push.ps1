Param(
    [int]$DebounceSeconds = 20,
    [string[]]$Exclude = @('.git', 'node_modules', 'bin', 'obj', 'target', '.idea', '.vs')
)

function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] [$Level] $Message"
}

function Get-RepoRoot {
    $root = (git rev-parse --show-toplevel) 2>$null
    if (-not $root) { $root = (Resolve-Path ".").Path }
    return $root
}

function Get-Branch {
    (git rev-parse --abbrev-ref HEAD).Trim()
}

function Has-Changes {
    $status = git status --porcelain
    return -not [string]::IsNullOrWhiteSpace($status)
}

function Invoke-CommitPush {
    try {
        if (-not (Has-Changes)) { return }

        git add -A | Out-Null
        $branch = Get-Branch
        $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'

        git commit -m "chore(auto): sync $branch @ $ts" | Out-Null
        if ($LASTEXITCODE -ne 0) { return }

        git push
        if ($LASTEXITCODE -ne 0) {
            Write-Log "Push failed, attempting pull --rebase then push" "WARN"
            git pull --rebase origin $branch
            if ($LASTEXITCODE -ne 0) {
                Write-Log "Pull --rebase failed; manual resolution needed. Auto sync paused." "ERROR"
                return
            }
            git push
            if ($LASTEXITCODE -ne 0) {
                Write-Log "Push after rebase failed; manual resolution needed." "ERROR"
            } else {
                Write-Log "Rebased and pushed to $branch"
            }
        } else {
            Write-Log "Auto-pushed changes to $branch"
        }
    } catch {
        Write-Log "Error during auto commit/push: $_" "ERROR"
    }
}

$repoRoot = Get-RepoRoot
Set-Location $repoRoot
Write-Log "Watching $repoRoot for changes (debounce: ${DebounceSeconds}s). Press Ctrl+C to stop."

$script:pending = $false
$script:lastChange = Get-Date

function Is-Excluded([string]$path) {
    foreach ($ex in $Exclude) {
        $full = Join-Path $repoRoot $ex
        if ($path -like "$full*") { return $true }
    }
    return $false
}

$fsw = New-Object System.IO.FileSystemWatcher
$fsw.Path = $repoRoot
$fsw.Filter = '*'
$fsw.IncludeSubdirectories = $true
$fsw.EnableRaisingEvents = $true

$action = {
    param($Source, $EventArgs)
    $p = $EventArgs.FullPath
    if (-not (Is-Excluded $p)) {
        $script:pending = $true
        $script:lastChange = Get-Date
    }
}

$subs = @()
$subs += Register-ObjectEvent $fsw Changed -Action $action
$subs += Register-ObjectEvent $fsw Created -Action $action
$subs += Register-ObjectEvent $fsw Deleted -Action $action
$subs += Register-ObjectEvent $fsw Renamed -Action $action

$timer = New-Object System.Timers.Timer
$timer.Interval = 1000
$timer.AutoReset = $true

$subs += Register-ObjectEvent $timer Elapsed -Action {
    if ($script:pending -and ((Get-Date) - $script:lastChange).TotalSeconds -ge $DebounceSeconds) {
        $script:pending = $false
        Invoke-CommitPush
    }
}

$timer.Start()

# Initial sync on start if there are pending changes
if (Has-Changes) { Invoke-CommitPush }

try {
    while ($true) { Wait-Event -Timeout 2 | Out-Null }
} finally {
    foreach ($s in $subs) { Unregister-Event -SourceIdentifier $s.Name -ErrorAction SilentlyContinue }
    $fsw.EnableRaisingEvents = $false
    $timer.Stop()
    $timer.Dispose()
}