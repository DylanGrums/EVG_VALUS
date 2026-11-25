# Remplace ADMIN_PASSWORD (Production) sur Vercel. Le mot de passe est saisi ici, jamais affiche.
#   powershell -ExecutionPolicy Bypass -File scripts\changer-mdp-admin.ps1
Set-Location (Split-Path $PSScriptRoot -Parent)
$scope = "dylans-projects-17494e46"

while ($true) {
  $first = Read-Host "Nouveau mot de passe des organisateurs" -AsSecureString
  $second = Read-Host "Confirme-le" -AsSecureString
  $a = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($first))
  $b = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($second))
  if ($a -ne $b) { Write-Host "Les deux saisies different, recommence." -ForegroundColor Yellow; continue }
  if ($a.Length -lt 6) { Write-Host "Trop court (6 caracteres minimum)." -ForegroundColor Yellow; continue }
  break
}

cmd /c "npx --yes vercel@latest env rm ADMIN_PASSWORD production --yes --scope $scope >nul 2>&1"
# Ecrit la valeur sans retour a la ligne final, via un fichier temporaire supprime ensuite.
$tmp = [IO.Path]::GetTempFileName()
[IO.File]::WriteAllText($tmp, $a)
cmd /c "npx --yes vercel@latest env add ADMIN_PASSWORD production --scope $scope < `"$tmp`""
$code = $LASTEXITCODE
Remove-Item $tmp -Force
$a = $null; $b = $null
if ($code -ne 0) { Write-Host "Echec de l'ajout." -ForegroundColor Red; exit 1 }
Write-Host "ADMIN_PASSWORD remplace. Dis a Claude que c'est fait : il redeploie." -ForegroundColor Green
