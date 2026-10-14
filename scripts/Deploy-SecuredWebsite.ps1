param([string]$SSHKey = "$env:USERPROFILE\.ssh\YOUR_SSH_KEY")
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path -LiteralPath $SSHKey -PathType Leaf)) { throw 'Dedicated SSH key not found.' }
function Invoke-CheckedPython {
    param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments)
    & python @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Python operation failed with exit code $LASTEXITCODE" }
}
$previousKey = $env:PEILIAO_SSH_KEY
$env:PEILIAO_SSH_KEY = $SSHKey
try {
    Invoke-CheckedPython update-v4/tests/build-release.py
    Invoke-CheckedPython scripts/ssh_ops.py run scripts/prepare-v4-stage.sh
    Invoke-CheckedPython scripts/ssh_ops.py upload update-v4/secured-v4.zip /root/peiliao-security/v4/secured-v4.zip
    Invoke-CheckedPython scripts/ssh_ops.py upload update-v4/tests/api-test.py /root/peiliao-security/v4/package/tests/api-test.py
    Invoke-CheckedPython scripts/ssh_ops.py upload update-v4/tests/security-api-test.py /root/peiliao-security/v4/package/tests/security-api-test.py
    Invoke-CheckedPython scripts/ssh_ops.py upload update-v2/server/app.py /root/peiliao-security/v4/update-v2/server/app.py
    Invoke-CheckedPython scripts/ssh_ops.py upload scripts/security-database-fingerprint.py /root/peiliao-security/v4/security-database-fingerprint.py
    Invoke-CheckedPython scripts/ssh_ops.py run scripts/verify-target-v4.sh
    Invoke-CheckedPython scripts/ssh_ops.py run scripts/publish-secured-v4.sh
    Invoke-CheckedPython scripts/verify-public-security.py
} finally {
    if ($null -eq $previousKey) { Remove-Item Env:\PEILIAO_SSH_KEY -ErrorAction SilentlyContinue }
    else { $env:PEILIAO_SSH_KEY = $previousKey }
}
