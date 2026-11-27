$invokeRestMethodParameters = (Get-Command Invoke-RestMethod -CommandType Cmdlet -ErrorAction Stop).Parameters
$workflowCalls = @{
  'release and asset list GET' = @('Method', 'Uri', 'Headers')
  'tag ref GET' = @('Method', 'Uri', 'Headers', 'SkipHttpErrorCheck')
  'asset upload POST' = @('Method', 'Uri', 'Headers', 'ContentType', 'InFile')
}
foreach ($callName in $workflowCalls.Keys) {
  foreach ($parameterName in $workflowCalls[$callName]) {
    if (-not $invokeRestMethodParameters.ContainsKey($parameterName)) {
      throw "Workflow $callName uses unsupported Invoke-RestMethod parameter '$parameterName'."
    }
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
Write-Output 'PowerShell Invoke-RestMethod parameters, response shape, URI, and body checks passed.'
