$invokeRestMethod = Get-Command Invoke-RestMethod -CommandType Cmdlet -ErrorAction Stop
$requiredParameters = @('Uri', 'Method', 'Headers', 'ContentType', 'InFile', 'SkipHttpErrorCheck')
foreach ($parameterName in $requiredParameters) {
  if (-not $invokeRestMethod.Parameters.ContainsKey($parameterName)) {
    throw "Invoke-RestMethod does not expose expected parameter '$parameterName'."
  }
}

try {
  Invoke-RestMethod -Uri $null -Method Get -Headers @{} -ErrorAction Stop
  throw 'Expected null Uri to fail during parameter binding without issuing a request.'
} catch {
  if ($_.FullyQualifiedErrorId -notlike 'ParameterArgumentValidationErrorNullNotAllowed,*') {
    throw "Invoke-RestMethod probe failed outside null-Uri parameter validation: $($_.FullyQualifiedErrorId) $($_.Exception.Message)"
  }
}

function Invoke-GitHubResponseFixture {
  param([AllowEmptyCollection()][object]$Response)
  Write-Output -NoEnumerate $Response
}

function Assert-GitHubResponseShape {
  param(
    [string]$Case,
    [AllowEmptyCollection()][object]$Response,
    [int]$ExpectedCount,
    [string]$ExpectedNames
  )
  $items = @((Invoke-GitHubResponseFixture -Response $Response))
  if ($items.Count -ne $ExpectedCount) {
    throw "$Case returned $($items.Count) entries; expected $ExpectedCount."
  }
  $names = @($items | ForEach-Object { [string]$_.name }) -join '|'
  if ($names -cne $ExpectedNames) {
    throw "$Case returned names '$names'; expected '$ExpectedNames'."
  }
}

$empty = [object[]]::new(0)
$first = [pscustomobject]@{ name = 'first' }
$second = [pscustomobject]@{ name = 'second' }
$one = [object[]]::new(1)
$one.SetValue($first, 0)
$two = [object[]]::new(2)
$two.SetValue($first, 0)
$two.SetValue($second, 1)

Assert-GitHubResponseShape -Case 'zero API entries' -Response $empty -ExpectedCount 0 -ExpectedNames ''
Assert-GitHubResponseShape -Case 'one API entry' -Response $one -ExpectedCount 1 -ExpectedNames 'first'
Assert-GitHubResponseShape -Case 'two API entries' -Response $two -ExpectedCount 2 -ExpectedNames 'first|second'

$uploadUrl = 'https://uploads.github.com/repos/smart-tinker/arkita/releases/458875356/assets{?name,label}'
$uploadBase = $uploadUrl -replace '\{\?name,label\}$', ''
$assetName = [Uri]::EscapeDataString('Arkita-0.7.1-rc.1-win-x64-setup.exe')
$uploadUri = "${uploadBase}?name=${assetName}"
$expectedUri = 'https://uploads.github.com/repos/smart-tinker/arkita/releases/458875356/assets?name=Arkita-0.7.1-rc.1-win-x64-setup.exe'
if ($uploadUri -cne $expectedUri) {
  throw "Upload URI '$uploadUri' did not match '$expectedUri'."
}

$env:INSTALLER_NAME = 'Arkita-0.7.1-rc.1-win-x64-setup.exe'
$body = "Installer ${env:INSTALLER_NAME}: 123 bytes, SHA-256 abcdef."
if (-not $body.Contains('Installer Arkita-0.7.1-rc.1-win-x64-setup.exe: 123 bytes, SHA-256 abcdef.')) {
  throw 'Installer name/colon interpolation did not preserve the release body.'
}
Write-Output 'PowerShell Invoke-RestMethod parameter, response shape, URI, and body checks passed.'
