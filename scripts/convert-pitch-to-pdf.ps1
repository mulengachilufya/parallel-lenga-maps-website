# Convert the pitch deck PPTX to PDF using the locally-installed PowerPoint
# (COM automation). Faster and more reliable than headless converters here
# because PowerPoint is already installed and renders fonts/effects natively.
#
# Usage:  powershell -File scripts/convert-pitch-to-pdf.ps1

param(
  [string]$Pptx = "$PSScriptRoot\..\pitch\lenga-maps-pitch.pptx",
  [string]$Pdf  = "$PSScriptRoot\..\pitch\lenga-maps-pitch.pdf"
)

$Pptx = (Resolve-Path $Pptx).Path
$Pdf  = [System.IO.Path]::GetFullPath($Pdf)

# 32 = ppSaveAsPDF
$ppSaveAsPDF = 32

Write-Host "Converting:"
Write-Host "  $Pptx"
Write-Host "  -> $Pdf"

$ppt = New-Object -ComObject PowerPoint.Application
# WithWindow=0 keeps the conversion offscreen
$pres = $ppt.Presentations.Open($Pptx, $true, $false, $false)
try {
    $pres.SaveAs($Pdf, $ppSaveAsPDF)
} finally {
    $pres.Close()
    $ppt.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($pres) | Out-Null
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($ppt)  | Out-Null
}

if (Test-Path $Pdf) {
    $kb = [Math]::Round((Get-Item $Pdf).Length / 1024, 1)
    Write-Host "wrote $Pdf  ($kb KB)"
} else {
    Write-Error "PDF was not created"
    exit 1
}
