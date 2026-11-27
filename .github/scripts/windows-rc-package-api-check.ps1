function ConvertTo-GitHubList {
  param([AllowNull()][AllowEmptyCollection()][object]$Response)
  $items = [System.Collections.Generic.List[object]]::new()
  if ($null -eq $Response) {
    return ,$items
  }
  if ($Response -is [array]) {
    foreach ($entry in $Response) {
      if ($entry -is [array]) {
        foreach ($nestedEntry in $entry) {
          if ($null -ne $nestedEntry) {
            $items.Add($nestedEntry)
          }
        }
      } elseif ($null -ne $entry) {
        $items.Add($entry)
      }
    }
  } else {
    $items.Add($Response)
  }
  return ,$items
}

function Assert-GitHubList {
  param(
    [string]$Case,
    [AllowNull()][AllowEmptyCollection()][object]$Response,
    [int]$ExpectedCount,
    [string]$ExpectedNames
  )
  $actual = ConvertTo-GitHubList -Response $Response
  if ($actual.Count -ne $ExpectedCount) {
    throw "$Case returned $($actual.Count) entries; expected $ExpectedCount."
  }
  $actualNames = @($actual | ForEach-Object { [string]$_.name }) -join '|'
  if ($actualNames -cne $ExpectedNames) {
    throw "$Case returned names '$actualNames'; expected '$ExpectedNames'."
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
$nestedEmpty = [object[]]::new(1)
$nestedEmpty.SetValue($empty, 0)
$nestedOne = [object[]]::new(1)
$nestedOne.SetValue($one, 0)
$nestedTwo = [object[]]::new(1)
$nestedTwo.SetValue($two, 0)

Assert-GitHubList -Case 'empty response' -Response $empty -ExpectedCount 0 -ExpectedNames ''
Assert-GitHubList -Case 'nested empty response' -Response $nestedEmpty -ExpectedCount 0 -ExpectedNames ''
Assert-GitHubList -Case 'single response' -Response $first -ExpectedCount 1 -ExpectedNames 'first'
Assert-GitHubList -Case 'single-item array' -Response $one -ExpectedCount 1 -ExpectedNames 'first'
Assert-GitHubList -Case 'nested single-item array' -Response $nestedOne -ExpectedCount 1 -ExpectedNames 'first'
Assert-GitHubList -Case 'two-item array' -Response $two -ExpectedCount 2 -ExpectedNames 'first|second'
Assert-GitHubList -Case 'nested two-item array' -Response $nestedTwo -ExpectedCount 2 -ExpectedNames 'first|second'

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
Write-Output 'PowerShell release API collection and upload URI checks passed.'
