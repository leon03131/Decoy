# Generates the installer artwork (NSIS wants 24-bit BMP files):
#   src-tauri/windows/sidebar.bmp   164x314  Welcome / Finish pages
#   src-tauri/windows/header.bmp    150x57   header of the other pages
# Run from the repository root:  powershell -File scripts/make-installer-art.ps1
Add-Type -AssemblyName System.Drawing

$out = Join-Path $PSScriptRoot '..\src-tauri\windows'
New-Item -ItemType Directory -Force $out | Out-Null
$out = (Resolve-Path $out).Path

$violet = [System.Drawing.Color]::FromArgb(124, 108, 246)
$cyan = [System.Drawing.Color]::FromArgb(56, 208, 255)

function New-Canvas($w, $h, $scale) {
    $bmp = New-Object System.Drawing.Bitmap ($w * $scale), ($h * $scale), ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.TextRenderingHint = 'AntiAliasGridFit'
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.ScaleTransform($scale, $scale)
    return @{ Bmp = $bmp; G = $g }
}

function Save-Bmp24($src, $w, $h, $path) {
    # downscale the supersampled canvas to its real size, 24 bit, no alpha
    $dst = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($dst)
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.PixelOffsetMode = 'HighQuality'
    $g.SmoothingMode = 'HighQuality'
    $g.DrawImage($src, 0, 0, $w, $h)
    $g.Dispose()
    $dst.Save($path, [System.Drawing.Imaging.ImageFormat]::Bmp)
    $dst.Dispose()
}

function Rounded($x, $y, $w, $h, $r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

function Draw-Logo($g, $x, $y, $size) {
    $rect = New-Object System.Drawing.RectangleF $x, $y, $size, $size
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $violet, $cyan, 45
    $g.FillPath($brush, (Rounded $x $y $size $size ($size * 0.26)))
    $font = New-Object System.Drawing.Font 'Segoe UI Black', ($size * 0.5), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
    $g.DrawString('D', $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF $x, ($y + $size * 0.03), $size, $size), $fmt)
}

# ---------------------------------------------------------------- sidebar 164x314
$W = 164; $H = 314
$c = New-Canvas $W $H 4
$g = $c.G

$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Rectangle 0, 0, $W, $H), ([System.Drawing.Color]::FromArgb(10, 10, 16)), ([System.Drawing.Color]::FromArgb(27, 20, 66)), 90
$g.FillRectangle($bg, 0, 0, $W, $H)

# soft glows
foreach ($glow in @(@(-30, -40, 150, $violet, 70), @(40, 200, 170, $cyan, 38))) {
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gp.AddEllipse($glow[0], $glow[1], $glow[2], $glow[2])
    $pb = New-Object System.Drawing.Drawing2D.PathGradientBrush $gp
    $pb.CenterColor = [System.Drawing.Color]::FromArgb($glow[4], $glow[3])
    $pb.SurroundColors = @([System.Drawing.Color]::FromArgb(0, $glow[3]))
    $g.FillPath($pb, $gp)
}

# timer-ring motif, bottom
$ringPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(36, 255, 255, 255)), 6
$g.DrawEllipse($ringPen, 22, 176, 120, 120)
$arc = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Rectangle 22, 176, 120, 120), $violet, $cyan, 45
$arcPen = New-Object System.Drawing.Pen $arc, 6
$arcPen.StartCap = 'Round'; $arcPen.EndCap = 'Round'
$g.DrawArc($arcPen, 22, 176, 120, 120, -90, 250)
$dot = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(230, 255, 255, 255))
$g.FillEllipse($dot, 79, 171, 8, 8)

Draw-Logo $g 22 26 52

$f1 = New-Object System.Drawing.Font 'Segoe UI Semibold', 23, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString('Decoy', $f1, [System.Drawing.Brushes]::White, 20, 88)
$f2 = New-Object System.Drawing.Font 'Segoe UI', 10.5, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString("Stand-in game processes", $f2, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(170, 205, 205, 235))), 22, 122)

Save-Bmp24 $c.Bmp $W $H (Join-Path $out 'sidebar.bmp')
$g.Dispose(); $c.Bmp.Dispose()

# ---------------------------------------------------------------- header 150x57
$W = 150; $H = 57
$c = New-Canvas $W $H 4
$g = $c.G
$g.Clear([System.Drawing.Color]::White)
Draw-Logo $g 98 10 38
$f3 = New-Object System.Drawing.Font 'Segoe UI Semibold', 11, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
Save-Bmp24 $c.Bmp $W $H (Join-Path $out 'header.bmp')
$g.Dispose(); $c.Bmp.Dispose()

Get-ChildItem $out -Filter *.bmp | ForEach-Object { '{0}  {1} bytes' -f $_.Name, $_.Length }
