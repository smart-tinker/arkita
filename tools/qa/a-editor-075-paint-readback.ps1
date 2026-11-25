$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$mode = $env:ARKITA_QA_MODE
$clipboardPath = $env:ARKITA_QA_CLIPBOARD_PNG
$paintPath = $env:ARKITA_QA_PAINT_PNG
$rawSamplePoints = $env:ARKITA_QA_SAMPLE_POINTS
$points = @()
if ($rawSamplePoints) { $points = ConvertFrom-Json $rawSamplePoints }
$script:samplePointsJson = $rawSamplePoints
$script:samplePointsContainerType = $points.GetType().FullName
$script:samplePointsCount = $points.Count
$script:pixelReadArguments = @()

$data = [System.Windows.Forms.Clipboard]::GetDataObject()
if (-not $data) { throw 'Windows OS clipboard is empty.' }
$formats = @($data.GetFormats())
$image = [System.Windows.Forms.Clipboard]::GetImage()
$pngFormat = [System.Windows.Forms.DataFormats]::GetFormat('PNG').Name
$rawPng = $null
if ($formats -contains $pngFormat) {
  $rawPng = $data.GetData($pngFormat)
  if ($rawPng -is [System.IO.Stream]) {
    if ($rawPng.CanSeek) { $rawPng.Position = 0 }
    $memory = New-Object System.IO.MemoryStream
    $rawPng.CopyTo($memory)
    $rawPng = $memory.ToArray()
    $memory.Dispose()
  }
}
if ($rawPng -is [byte[]] -and $rawPng.Length -gt 32) {
  [System.IO.File]::WriteAllBytes($clipboardPath, $rawPng)
} elseif ($image) {
  $image.Save($clipboardPath, [System.Drawing.Imaging.ImageFormat]::Png)
} else {
  throw "Windows OS clipboard has no readable image; formats: $($formats -join ', ')"
}

function Read-Pixel($bitmap, $point) {
  $x = $point.x; $y = $point.y
  $pointType = 'null'; if ($null -ne $point) { $pointType = $point.GetType().FullName }
  $xType = 'null'; if ($null -ne $x) { $xType = $x.GetType().FullName }
  $yType = 'null'; if ($null -ne $y) { $yType = $y.GetType().FullName }
  $script:pixelReadArguments += [pscustomobject]@{
    pointType = $pointType
    name = $point.name
    xType = $xType
    xValue = $x
    yType = $yType
    yValue = $y
  }
  try {
    $pixel = $bitmap.GetPixel([int]$point.x, [int]$point.y)
  } catch {
    $diagnostic = [pscustomobject]@{
      rawSamplePoints = $script:samplePointsJson
      parsedContainerType = $script:samplePointsContainerType
      parsedCount = $script:samplePointsCount
      beforeGetPixel = @($script:pixelReadArguments)
      errorType = $_.Exception.GetType().FullName
      errorMessage = $_.Exception.Message
    }
    [Console]::Error.WriteLine("A_EDITOR_075_PIXEL_READBACK_DIAGNOSTIC $($diagnostic | ConvertTo-Json -Compress -Depth 8)")
    throw
  }
  return @{ r = [int]$pixel.R; g = [int]$pixel.G; b = [int]$pixel.B; a = [int]$pixel.A }
}

$clipboardBitmap = [System.Drawing.Bitmap]::FromFile($clipboardPath)
$clipboardSamples = @{}
foreach ($point in $points) { $clipboardSamples[$point.name] = Read-Pixel $clipboardBitmap $point }
$clipboardResult = @{
  width = $clipboardBitmap.Width
  height = $clipboardBitmap.Height
  pixelFormat = [string]$clipboardBitmap.PixelFormat
  background = Read-Pixel $clipboardBitmap @{ x = 0; y = 0 }
  samples = $clipboardSamples
}
$clipboardBitmap.Dispose()

$paintResult = $null
$consumer = $null
if ($mode -eq 'paint') {
  $paintCommand = Get-Command mspaint.exe -ErrorAction SilentlyContinue
  if (-not $paintCommand) {
    $capability = 'Microsoft.Windows.MSPaint~~~~0.0.1.0'
    $state = (Get-WindowsCapability -Online -Name $capability -ErrorAction Stop).State
    if ($state -ne 'Installed') { Add-WindowsCapability -Online -Name $capability -ErrorAction Stop | Out-Null }
    $paintCommand = Get-Command mspaint.exe -ErrorAction SilentlyContinue
  }
  if (-not $paintCommand) { throw 'Paint is unavailable on this windows-2025 runner; no other consumer was substituted.' }
  $paintExe = $paintCommand.Source
  $paintVersion = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($paintExe).FileVersion
  if (Test-Path $paintPath) { Remove-Item -LiteralPath $paintPath -Force }
  $process = Start-Process -FilePath $paintExe -PassThru
  try {
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    $paintWindow = $null
    do {
      Start-Sleep -Milliseconds 250
      $process.Refresh()
      $paintWindow = Get-Process -Name 'mspaint' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
      if (-not $paintWindow) { $paintWindow = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -match 'Paint' } | Select-Object -First 1 }
    } while ($process.MainWindowHandle -eq 0 -and -not $paintWindow -and [DateTime]::UtcNow -lt $deadline)
    if (-not $paintWindow -and $process.MainWindowHandle -ne 0) { $paintWindow = $process }
    if (-not $paintWindow) { throw 'Paint started without an accessible main window.' }
    $shell = New-Object -ComObject WScript.Shell
    if (-not $shell.AppActivate($paintWindow.Id)) { throw 'Could not activate the Paint window.' }
    Start-Sleep -Milliseconds 500
    [System.Windows.Forms.SendKeys]::SendWait('{ESC}')
    [System.Windows.Forms.SendKeys]::SendWait('^v')
    Start-Sleep -Seconds 2
    [System.Windows.Forms.SendKeys]::SendWait('^s')
    Start-Sleep -Milliseconds 1200
    [System.Windows.Forms.SendKeys]::SendWait('^a')
    [System.Windows.Forms.SendKeys]::SendWait($paintPath)
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while (-not (Test-Path -LiteralPath $paintPath) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 250 }
    if (-not (Test-Path -LiteralPath $paintPath)) { throw 'Paint did not save the pasted clipboard image as PNG.' }
    $paintBitmap = [System.Drawing.Bitmap]::FromFile($paintPath)
    try {
      $samplePixels = @{}
      foreach ($point in $points) { $samplePixels[$point.name] = Read-Pixel $paintBitmap $point }
      $whitePixels = 0
      for ($y = 120; $y -lt [Math]::Min(250, $paintBitmap.Height); $y++) {
        for ($x = 100; $x -lt [Math]::Min(300, $paintBitmap.Width); $x++) {
          $pixel = $paintBitmap.GetPixel($x, $y)
          if ($pixel.R -gt 235 -and $pixel.G -gt 235 -and $pixel.B -gt 235 -and $pixel.A -eq 255) { $whitePixels++ }
        }
      }
      $paintResult = @{
        width = $paintBitmap.Width
        height = $paintBitmap.Height
        pixelFormat = [string]$paintBitmap.PixelFormat
        background = Read-Pixel $paintBitmap @{ x = 0; y = 0 }
        samples = $samplePixels
        cyrillicWhitePixels = $whitePixels
      }
    } finally { $paintBitmap.Dispose() }
    $consumer = @{ name = 'Microsoft Paint'; executable = $paintExe; version = $paintVersion; pastedBy = 'Ctrl+V from the Windows system clipboard'; savedBy = 'Paint Save As PNG' }
  } finally {
    if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
  }
} elseif ($mode -ne 'clipboard') {
  throw "Unsupported QA mode: $mode"
}

$receipt = @{
  clipboardFormats = $formats
  clipboard = $clipboardResult
  paint = $paintResult
  consumer = $consumer
  pixels = @{}
}
if ($mode -eq 'clipboard') {
  $bitmap = [System.Drawing.Bitmap]::FromFile($clipboardPath)
  try { foreach ($point in $points) { $receipt.pixels[$point.name] = Read-Pixel $bitmap $point } }
  finally { $bitmap.Dispose() }
}
if ($image) { $image.Dispose() }
Write-Output (ConvertTo-Json -Compress -Depth 8 $receipt)
