# Configure le projet Vercel "evg" : connexion, liaison du dossier, verification de Neon,
# creation des secrets (generes sur ce PC, jamais affiches). A lancer depuis le dossier du projet :
#   powershell -ExecutionPolicy Bypass -File scripts\configurer-vercel.ps1
$ErrorActionPreference = "Continue"
Set-Location (Split-Path $PSScriptRoot -Parent)

$scope = "dylans-projects-17494e46"
$project = "evg"

function Invoke-VercelText([string]$arguments) {
  # cmd /c fusionne stdout et stderr sans que PowerShell 5.1 les transforme en erreurs.
  return (cmd /c "npx --yes vercel@latest $arguments 2>&1" | Out-String)
}

function New-Secret {
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Add-VercelEnv([string]$name, [string]$value) {
  $value | npx --yes vercel@latest env add $name production --scope $scope
  if ($LASTEXITCODE -ne 0) { throw "Impossible d'ajouter $name" }
  Write-Host "  $name ajoute (Production)." -ForegroundColor Green
}

Write-Host "1/4 Connexion a Vercel" -ForegroundColor Cyan
cmd /c "npx --yes vercel@latest whoami >nul 2>&1"
if ($LASTEXITCODE -ne 0) {
  Write-Host "  Une page de connexion Vercel va s'ouvrir : valide-la dans ton navigateur."
  npx --yes vercel@latest login
  if ($LASTEXITCODE -ne 0) { throw "Connexion Vercel echouee" }
}

Write-Host "2/4 Liaison du dossier au projet $project" -ForegroundColor Cyan
npx --yes vercel@latest link --yes --project $project --scope $scope
if ($LASTEXITCODE -ne 0) { throw "Liaison au projet echouee" }

Write-Host "3/4 Verification des variables existantes" -ForegroundColor Cyan
$existing = Invoke-VercelText "env ls production --scope $scope"
function Test-Var([string]$name) { return $existing -match "(?m)^\s*$name\s" }

if (-not (Test-Var "DATABASE_URL")) {
  Write-Host "  DATABASE_URL absent : la base Neon n'est pas connectee au projet '$project'." -ForegroundColor Yellow
  Write-Host "  Vercel > Storage > ta base Neon > Connect Project > '$project' (cocher Production et Preview), puis relance ce script."
  exit 1
}
Write-Host "  DATABASE_URL present (Neon connecte)." -ForegroundColor Green

Write-Host "4/4 Secrets de l'application" -ForegroundColor Cyan
foreach ($name in @("SESSION_SECRET", "GROUP_ACCESS_CODE")) {
  if (Test-Var $name) { Write-Host "  $name existe deja, conserve." } else { Add-VercelEnv $name (New-Secret) }
}

if (Test-Var "ADMIN_PASSWORD") {
  Write-Host "  ADMIN_PASSWORD existe deja, conserve."
} else {
  while ($true) {
    $first = Read-Host "  Choisis le mot de passe des organisateurs (6 caracteres minimum)" -AsSecureString
    $second = Read-Host "  Confirme-le" -AsSecureString
    $a = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($first))
    $b = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($second))
    if ($a -ne $b) { Write-Host "  Les deux saisies different, recommence." -ForegroundColor Yellow; continue }
    if ($a.Length -lt 6) { Write-Host "  Trop court (6 caracteres minimum)." -ForegroundColor Yellow; continue }
    Add-VercelEnv "ADMIN_PASSWORD" $a
    $a = $null; $b = $null
    break
  }
}

Write-Host ""
Write-Host "Termine. Dis a Claude que c'est fait : il relance le deploiement et verifie le site." -ForegroundColor Green
