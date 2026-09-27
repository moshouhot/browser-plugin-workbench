param(
    [int]$Port = 0,
    [string]$Session
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Config = Get-Content -LiteralPath (Join-Path $Root "workbench.config.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$StatePath = Join-Path $Root "runtime\browser-session.json"
$State = $null
if (Test-Path -LiteralPath $StatePath) {
    $State = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json
}

if ($Port -le 0) {
    if ($State -and $State.cdpPort) { $Port = [int]$State.cdpPort }
    else { $Port = [int]$Config.browser.cdpPort }
}

if (-not $Session) {
    if ($State -and $State.agentSession) { $Session = [string]$State.agentSession }
    elseif ($Config.browser.agentSession) { $Session = [string]$Config.browser.agentSession }
    else { $Session = "browser-plugin-workbench" }
}

$ExpectedUrl = if ($State -and $State.targetUrl) { [string]$State.targetUrl } else { [string]$Config.targetUrl }

$VersionUrl = "http://127.0.0.1:$Port/json/version"
try {
    $Version = Invoke-RestMethod -Uri $VersionUrl -TimeoutSec 2
} catch {
    throw "CDP is not reachable at $VersionUrl"
}

if (-not $Version.webSocketDebuggerUrl) {
    throw "CDP endpoint did not return webSocketDebuggerUrl"
}

Write-Host "[workbench] CDP HTTP PASS: $VersionUrl"

$ActualUrl = (& npx -y agent-browser --session $Session --cdp $Port --pin-tab get url | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw "agent-browser get url failed" }
if (-not $ActualUrl) { throw "agent-browser returned an empty URL" }

$ExpectedUri = [Uri]$ExpectedUrl
$ActualUri = [Uri]$ActualUrl
if ($ActualUri.Scheme -ne $ExpectedUri.Scheme -or $ActualUri.Host -ne $ExpectedUri.Host) {
    throw "agent-browser is attached to the wrong target. Expected host $($ExpectedUri.Host), got $ActualUrl"
}

Write-Host "[workbench] TARGET PASS: $ActualUrl"

& npx -y agent-browser --session $Session --cdp $Port --pin-tab get title
if ($LASTEXITCODE -ne 0) { throw "agent-browser get title failed" }

& npx -y agent-browser --session $Session --cdp $Port --pin-tab eval 'JSON.stringify({href:location.href,title:document.title})'
if ($LASTEXITCODE -ne 0) { throw "agent-browser eval failed" }

Write-Host "[workbench] AI ATTACH PASS"
