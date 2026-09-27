param(
    [string]$Url,
    [int]$Port = 0,
    [string]$Session,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Config = Get-Content -LiteralPath (Join-Path $Root "workbench.config.json") -Raw -Encoding UTF8 | ConvertFrom-Json

if (-not $Url -and $env:BPW_TARGET_URL) { $Url = [string]$env:BPW_TARGET_URL }
if (-not $Url) { $Url = [string]$Config.targetUrl }
if ($Port -le 0 -and $env:BPW_CDP_PORT) { $Port = [int]$env:BPW_CDP_PORT }
if ($Port -le 0) { $Port = [int]$Config.browser.cdpPort }
if (-not $Session -and $env:BPW_AGENT_SESSION) { $Session = [string]$env:BPW_AGENT_SESSION }
if (-not $Session) { $Session = [string]$Config.browser.agentSession }
if (-not $Session) { $Session = "browser-plugin-workbench" }

$SkillRoot = if ($env:CENT_CDP_SKILL) { $env:CENT_CDP_SKILL } else { [string]$Config.browser.centCdpSkill }

Write-Host "[workbench] cent-cdp-browser: $(if ($SkillRoot) { $SkillRoot } else { '<not configured>' })"
Write-Host "[workbench] target URL: $Url"
Write-Host "[workbench] preferred CDP port: $Port"
Write-Host "[workbench] agent-browser session: $Session"

if ($DryRun) {
    if (-not $SkillRoot) {
        Write-Host "[workbench] note: set CENT_CDP_SKILL or browser.centCdpSkill before a real browser run"
    }
    Write-Host "[workbench] DRY RUN PASS"
    exit 0
}

if (-not $SkillRoot) {
    throw "cent-cdp-browser is not configured. Set environment variable CENT_CDP_SKILL or browser.centCdpSkill in workbench.config.json."
}

$Starter = Join-Path $SkillRoot "scripts\start_cent_cdp.py"
if (-not (Test-Path -LiteralPath $Starter)) {
    throw "cent-cdp-browser starter not found: $Starter"
}

$StarterOutput = @(& python $Starter --url $Url --port $Port)
$StarterExitCode = $LASTEXITCODE
$StarterOutput | ForEach-Object { Write-Host $_ }

if ($StarterExitCode -ne 0) {
    throw "cent-cdp-browser failed with exit code $StarterExitCode"
}

$StarterText = ($StarterOutput -join "`n").Trim()
try {
    $StarterResult = $StarterText | ConvertFrom-Json
} catch {
    throw "cent-cdp-browser did not return parseable JSON"
}

$ActualPort = if ($StarterResult.cdp_port) { [int]$StarterResult.cdp_port } else { $Port }
$RuntimeDir = Join-Path $Root "runtime"
New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null

$State = [ordered]@{
    cdpPort = $ActualPort
    targetUrl = $Url
    agentSession = $Session
    browser = [string]$StarterResult.browser
    userData = [string]$StarterResult.user_data
    profile = [string]$StarterResult.profile
    startedAt = (Get-Date).ToString("o")
}
$State | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $RuntimeDir "browser-session.json") -Encoding UTF8

Write-Host "[workbench] opening isolated workbench tab on CDP port $ActualPort"
& npx -y agent-browser --session $Session --cdp $ActualPort --pin-tab tab new
if ($LASTEXITCODE -ne 0) {
    throw "agent-browser could not create a workbench tab"
}

& npx -y agent-browser --session $Session --cdp $ActualPort --pin-tab open $Url
if ($LASTEXITCODE -ne 0) {
    throw "agent-browser could not open target URL: $Url"
}

$CurrentUrl = (& npx -y agent-browser --session $Session --cdp $ActualPort --pin-tab get url | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or -not $CurrentUrl) {
    throw "agent-browser could not read the target tab URL"
}

Write-Host "[workbench] TARGET TAB READY: $CurrentUrl"
