# Builds the static site on this PC and publishes it to the VPS.
#   powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1 -Server root@203.0.113.10
# The build needs 1-2 GB of RAM, so it runs here, never on the VPS. The VPS
# only unpacks the files and nginx serves them.
param(
    [Parameter(Mandatory = $true)][string]$Server,   # user@host
    [string]$Dir = "/var/www/id-card",
    [switch]$SkipBuild
)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

# The `node` on PATH is shadowed by an npm package on this machine (CLAUDE.md).
$nvm = "C:\Users\rajen\AppData\Local\nvm\v22.14.0"
if (Test-Path $nvm) { $env:Path = "$nvm;$env:Path" }

function Run($exe, [string[]]$argv) {
    & $exe @argv
    if ($LASTEXITCODE -ne 0) { throw "$exe $($argv -join ' ') failed ($LASTEXITCODE)" }
}

if (-not $SkipBuild) {
    Run npm.cmd @("run", "build")
}
Run node @("deploy/precompress.mjs")

# One archive instead of hundreds of scp round trips. The stray copy of the
# worker source (render.worker.*.ts) is never requested, so it stays behind.
$tgz = Join-Path $env:TEMP "id-card-out.tgz"
# Windows' own bsdtar: Git's GNU tar would read "C:" in the path as a remote host.
Run "$env:SystemRoot\System32\tar.exe" @("-czf", $tgz, "--exclude=*.ts", "-C", "out", ".")
Run scp @($tgz, "${Server}:/tmp/id-card-out.tgz")

# Unpack beside the live folder, then swap, so a half-finished upload is never served.
$remote = @"
set -e
S=; [ "`$(id -u)" -ne 0 ] && S=sudo
`$S rm -rf $Dir.new $Dir.old
`$S mkdir -p $Dir.new
`$S tar -xzf /tmp/id-card-out.tgz --no-same-owner -C $Dir.new
`$S chmod -R a+rX $Dir.new
[ -d $Dir ] && `$S mv $Dir $Dir.old
`$S mv $Dir.new $Dir
`$S rm -rf $Dir.old /tmp/id-card-out.tgz
echo "deployed to $Dir"
"@ -replace "`r", ""
Run ssh @("-t", $Server, $remote)
Remove-Item $tgz
