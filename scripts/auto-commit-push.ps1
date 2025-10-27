<#!
Auto commit and push watcher for Git repositories.

Features:
- Watches the repository for file changes (create/change/delete/rename)
- Debounces rapid changes to avoid too many commits
- Runs: git add -A; git commit -m "Auto-commit: <timestamp>"; git push
- On push failure, attempts: git pull --rebase; git push

Usage:
	powershell -ExecutionPolicy Bypass -File scripts/auto-commit-push.ps1 -DebounceSeconds 2
	Press Ctrl+C to stop.
!#>

param(
	[int]$DebounceSeconds = 2,
	[string[]]$Exclude = @('.git', '.vscode', 'node_modules', '.venv', 'venv', 'dist', 'build')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-RepoRoot {
	try {
		$root = (git rev-parse --show-toplevel).Trim()
		if (-not [string]::IsNullOrWhiteSpace($root)) { return $root }
	} catch {}
	# Fallback: parent of the script's directory
	return (Split-Path -Path $PSScriptRoot -Parent)
}

function Test-Excluded([string]$fullPath, [string[]]$excludeList) {
	foreach ($ex in $excludeList) {
		if ([string]::IsNullOrWhiteSpace($ex)) { continue }
		# Match as path segment anywhere in the full path
		if ($fullPath -like "*\$ex\*") { return $true }
	}
	return $false
}

function Test-Changes {
	$status = git status --porcelain
	return -not [string]::IsNullOrWhiteSpace(($status | Out-String))
}

function Invoke-CommitPush {
		if (-not (Test-Changes)) {
		Write-Host "No changes to commit." -ForegroundColor DarkGray
		return
	}
	try {
		& git add -A | Out-Null
		$msg = "Auto-commit: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
		& git commit -m $msg | Out-Null
		Write-Host "Committed changes: $msg" -ForegroundColor Cyan
	} catch {
		# It's okay if there was nothing to commit between events
		Write-Host "Commit step skipped or failed: $_" -ForegroundColor Yellow
	}

	& git push | Out-Null
	$code = $LASTEXITCODE
	if ($code -eq 0) {
		Write-Host "Pushed successfully." -ForegroundColor Green
		return
	}

	Write-Host "Push failed (code=$code). Trying: git pull --rebase ..." -ForegroundColor Yellow
	try {
		& git pull --rebase | Out-Null
		& git push | Out-Null
		if ($LASTEXITCODE -eq 0) {
			Write-Host "Pushed after rebase." -ForegroundColor Green
		} else {
			Write-Host "Push still failing (code=$LASTEXITCODE)." -ForegroundColor Red
		}
	} catch {
		Write-Host "Rebase/push failed: $_" -ForegroundColor Red
	}
}

$repoRoot = Get-RepoRoot
Set-Location $repoRoot

Write-Host "Auto-push watcher starting in: $repoRoot" -ForegroundColor Cyan
Write-Host "Excluded paths: $($Exclude -join ', ')" -ForegroundColor DarkCyan
Write-Host "Debounce: $DebounceSeconds second(s)" -ForegroundColor DarkCyan

# FileSystemWatcher
$fsw = New-Object System.IO.FileSystemWatcher
$fsw.Path = $repoRoot
$fsw.Filter = '*.*'
$fsw.IncludeSubdirectories = $true
$fsw.EnableRaisingEvents = $true

$script:lastEventAt = Get-Date
$script:pending = $false

$handlers = @()

foreach ($ev in 'Changed','Created','Deleted','Renamed') {
	$id = "gitwatch_" + $ev
	$handler = Register-ObjectEvent -InputObject $fsw -EventName $ev -SourceIdentifier $id -Action {
		$path = $EventArgs.FullPath
		if (Test-Excluded -fullPath $path -excludeList $using:Exclude) { return }
		# Ignore temporary files created by editors
		if ($path -match '\\~\$' -or $path -match '\\.swp$' -or $path -match '\\.tmp$') { return }
		$script:pending = $true
		$script:lastEventAt = Get-Date
	}
	$handlers += $handler
}

try {
	while ($true) {
		Start-Sleep -Milliseconds 500
		if ($script:pending -and ((Get-Date) - $script:lastEventAt).TotalSeconds -ge $DebounceSeconds) {
			$script:pending = $false
			Invoke-CommitPush
		}
	}
} finally {
	foreach ($h in $handlers) { Unregister-Event -SourceIdentifier $h.Name -ErrorAction SilentlyContinue }
	$fsw.EnableRaisingEvents = $false
	$fsw.Dispose()
}
