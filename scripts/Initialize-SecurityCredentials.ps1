$ErrorActionPreference='Stop'
$privateDirectory=Join-Path $env:USERPROFILE '.codex\private\peiliao-security-20261003'
$keyFile=Join-Path $env:USERPROFILE '.ssh\YOUR_SSH_KEY'
$credentialsFile=Join-Path $privateDirectory 'credentials.clixml'
if((Test-Path -LiteralPath $credentialsFile) -or (Test-Path -LiteralPath $keyFile)){throw 'Credentials already exist; refusing to overwrite.'}
New-Item -ItemType Directory -Path $privateDirectory -Force | Out-Null
$identitySid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls $privateDirectory /inheritance:r /grant:r "*${identitySid}:(OI)(CI)(F)" '*S-1-5-18:(OI)(CI)(F)' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Could not restrict credential directory ACL'}
function New-StrongSecret {
  $secretBytes=New-Object byte[] 32
  $generator=[Security.Cryptography.RandomNumberGenerator]::Create()
  try{$generator.GetBytes($secretBytes)}finally{$generator.Dispose()}
  return [Convert]::ToBase64String($secretBytes).TrimEnd('=').Replace('+','-').Replace('/','_')
}
$credentials=[ordered]@{
  Server='YOUR_SERVER_HOST'
  Domain='YOUR_APP_DOMAIN'
  SSHKey=$keyFile
  SSH=[PSCredential]::new('root',(ConvertTo-SecureString (New-StrongSecret) -AsPlainText -Force))
  Panel=[PSCredential]::new('33b43edf',(ConvertTo-SecureString (New-StrongSecret) -AsPlainText -Force))
  Website=[PSCredential]::new('root',(ConvertTo-SecureString (New-StrongSecret) -AsPlainText -Force))
}
$credentials | Export-Clixml -LiteralPath $credentialsFile -Depth 6
& ssh-keygen -q -t ed25519 -f $keyFile -N '' -C 'peiliao-admin-local'
if($LASTEXITCODE -ne 0){throw 'SSH key generation failed'}
& icacls $keyFile /inheritance:r /grant:r "*${identitySid}:(F)" '*S-1-5-18:(F)' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Could not restrict private key ACL'}
Write-Output "Created encrypted credentials: $credentialsFile"
Write-Output "Created restricted SSH key: $keyFile"
