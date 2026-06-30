$ErrorActionPreference = "Stop"

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$presentationRoot = Join-Path $repo "docs\presentacion"
$assets = Join-Path $presentationRoot "assets"
$output = Join-Path $presentationRoot "salida"

New-Item -ItemType Directory -Path $output -Force | Out-Null

function Get-Rgb([int]$Red, [int]$Green, [int]$Blue) {
  return $Red + ($Green -shl 8) + ($Blue -shl 16)
}

$colors = @{
  Ink = Get-Rgb 15 48 56
  Teal = Get-Rgb 13 81 91
  Pale = Get-Rgb 233 246 247
  Paper = Get-Rgb 248 250 250
  White = Get-Rgb 255 255 255
  Orange = Get-Rgb 240 90 40
  Muted = Get-Rgb 87 105 111
  Border = Get-Rgb 204 222 225
  Green = Get-Rgb 27 132 102
}

function Add-TextBox {
  param(
    $Slide,
    [string]$Text,
    [double]$Left,
    [double]$Top,
    [double]$Width,
    [double]$Height,
    [double]$Size = 20,
    [int]$Color = $colors.Ink,
    [bool]$Bold = $false,
    [int]$Alignment = 1,
    [string]$FontName = "Aptos"
  )

  $shape = $Slide.Shapes.AddTextbox(1, $Left, $Top, $Width, $Height)
  $shape.TextFrame2.MarginLeft = 0
  $shape.TextFrame2.MarginRight = 0
  $shape.TextFrame2.MarginTop = 0
  $shape.TextFrame2.MarginBottom = 0
  $shape.TextFrame2.WordWrap = -1
  $shape.TextFrame2.TextRange.Text = $Text
  $shape.TextFrame2.TextRange.Font.Name = $FontName
  $shape.TextFrame2.TextRange.Font.Size = $Size
  $shape.TextFrame2.TextRange.Font.Bold = if ($Bold) { -1 } else { 0 }
  $shape.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = $Color
  $shape.TextFrame2.TextRange.ParagraphFormat.Alignment = $Alignment
  return $shape
}

function Add-Rectangle {
  param(
    $Slide,
    [double]$Left,
    [double]$Top,
    [double]$Width,
    [double]$Height,
    [int]$Fill,
    [int]$Line = $Fill,
    [double]$Radius = 0
  )

  $shapeType = if ($Radius -gt 0) { 5 } else { 1 }
  $shape = $Slide.Shapes.AddShape(
    $shapeType,
    $Left,
    $Top,
    $Width,
    $Height
  )
  $shape.Fill.ForeColor.RGB = $Fill
  $shape.Line.ForeColor.RGB = $Line
  if ($Radius -gt 0) {
    $shape.Adjustments.Item(1) = [Math]::Min($Radius, 0.4)
  }
  return $shape
}

function Add-SlideBase {
  param($Presentation, [string]$Section, [string]$Title)

  $slide = $Presentation.Slides.Add($Presentation.Slides.Count + 1, 12)
  Add-Rectangle $slide 0 0 960 540 $colors.Paper $colors.Paper | Out-Null
  Add-Rectangle $slide 0 0 960 8 $colors.Orange $colors.Orange | Out-Null
  Add-TextBox $slide $Section 48 28 220 20 11 $colors.Orange $true | Out-Null
  Add-TextBox $slide $Title 48 54 864 54 27 $colors.Ink $true 1 "Aptos Display" | Out-Null
  Add-TextBox $slide "COPPE · Presentación comercial" 48 512 300 14 9 $colors.Muted $false | Out-Null
  Add-TextBox $slide ([string]$slide.SlideIndex) 890 512 22 14 9 $colors.Muted $false 2 | Out-Null
  return $slide
}

function Add-Card {
  param(
    $Slide,
    [double]$Left,
    [double]$Top,
    [double]$Width,
    [double]$Height,
    [string]$Title,
    [string]$Body,
    [int]$Accent = $colors.Teal
  )

  Add-Rectangle $Slide $Left $Top $Width $Height $colors.White $colors.Border 0.12 | Out-Null
  Add-Rectangle $Slide $Left $Top 6 $Height $Accent $Accent | Out-Null
  Add-TextBox $Slide $Title ($Left + 20) ($Top + 18) ($Width - 34) 27 16 $colors.Ink $true | Out-Null
  Add-TextBox $Slide $Body ($Left + 20) ($Top + 52) ($Width - 34) ($Height - 64) 11.5 $colors.Muted $false | Out-Null
}

function Add-PictureContained {
  param(
    $Slide,
    [string]$Path,
    [double]$Left,
    [double]$Top,
    [double]$Width,
    [double]$Height
  )

  Add-Rectangle $Slide ($Left - 5) ($Top - 5) ($Width + 10) ($Height + 10) $colors.White $colors.Border 0.08 | Out-Null
  $Slide.Shapes.AddPicture($Path, 0, -1, $Left, $Top, $Width, $Height) | Out-Null
}

function New-CommercialPresentation {
  $powerPoint = New-Object -ComObject PowerPoint.Application
  $powerPoint.Visible = -1
  $powerPoint.DisplayAlerts = 1
  $presentation = $powerPoint.Presentations.Add()
  $presentation.PageSetup.SlideWidth = 960
  $presentation.PageSetup.SlideHeight = 540

  try {
    $slide = $presentation.Slides.Add(1, 12)
    Add-Rectangle $slide 0 0 960 540 $colors.Ink $colors.Ink | Out-Null
    Add-Rectangle $slide 0 0 14 540 $colors.Orange $colors.Orange | Out-Null
    Add-TextBox $slide "COPPE" 64 62 300 60 34 $colors.White $true 1 "Aptos Display" | Out-Null
    Add-TextBox $slide "Atención al cliente convertida en trabajo organizado" 64 150 770 120 33 $colors.White $true 1 "Aptos Display" | Out-Null
    Add-TextBox $slide "Centraliza consultas, prepara respuestas con IA y convierte cada conversación en una acción trazable." 64 292 740 74 18 (Get-Rgb 205 226 229) $false | Out-Null
    Add-Rectangle $slide 64 405 308 54 $colors.Orange $colors.Orange 0.15 | Out-Null
    Add-TextBox $slide "Piloto B2B · 30 días" 84 419 268 25 16 $colors.White $true | Out-Null
    Add-TextBox $slide "app.coppe.es" 736 490 160 18 11 (Get-Rgb 205 226 229) $false 2 | Out-Null

    $slide = Add-SlideBase $presentation "01 · PROBLEMA" "Las consultas llegan; el trabajo se dispersa"
    Add-Card $slide 48 130 200 142 "Canales separados" "Email, WhatsApp, formularios, llamadas y redes sin una visión única." | Out-Null
    Add-Card $slide 265 130 200 142 "Contexto fragmentado" "Cada persona conserva una parte de la conversación y de las decisiones." | Out-Null
    Add-Card $slide 482 130 200 142 "Seguimientos olvidados" "Los pendientes viven en notas, memoria o calendarios desconectados." | Out-Null
    Add-Card $slide 699 130 213 142 "Respuesta lenta" "Leer, clasificar y redactar desde cero consume tiempo operativo." | Out-Null
    Add-TextBox $slide "El coste real no es solo responder tarde: es perder continuidad, responsabilidad y oportunidades." 104 324 752 82 23 $colors.Teal $true 2 "Aptos Display" | Out-Null

    $slide = Add-SlideBase $presentation "02 · SOLUCIÓN" "Un flujo común para cada conversación"
    $steps = @(
      @("1", "Contacto", "Formulario, chat, email, WhatsApp o registro manual"),
      @("2", "Caso", "Cliente, mensaje, estado, prioridad y categoría"),
      @("3", "Asistente", "Resumen, intención, faltantes y borrador editable"),
      @("4", "Responsable", "Asignación, notas y trazabilidad del trabajo"),
      @("5", "Seguimiento", "Citas, recordatorios y cierre medible")
    )
    for ($index = 0; $index -lt $steps.Count; $index++) {
      $left = 48 + ($index * 174)
      Add-Rectangle $slide $left 148 150 225 $colors.White $colors.Border 0.12 | Out-Null
      Add-Rectangle $slide ($left + 18) 166 42 42 $colors.Orange $colors.Orange 0.3 | Out-Null
      Add-TextBox $slide $steps[$index][0] ($left + 18) 176 42 20 15 $colors.White $true 2 | Out-Null
      Add-TextBox $slide $steps[$index][1] ($left + 18) 226 116 28 16 $colors.Ink $true | Out-Null
      Add-TextBox $slide $steps[$index][2] ($left + 18) 268 116 80 11 $colors.Muted $false | Out-Null
      if ($index -lt ($steps.Count - 1)) {
        Add-TextBox $slide "→" ($left + 151) 245 24 30 20 $colors.Orange $true 2 | Out-Null
      }
    }
    Add-TextBox $slide "La persona conserva el control de la respuesta y de cada decisión." 130 416 700 35 18 $colors.Teal $true 2 | Out-Null

    $slide = Add-SlideBase $presentation "03 · PRODUCTO" "Una cola operativa compartida"
    Add-PictureContained $slide (Join-Path $assets "dashboard-demo.png") 48 124 590 308
    Add-Card $slide 670 124 242 94 "Prioridades visibles" "Nuevos, en seguimiento, esperando cliente y urgentes." $colors.Orange | Out-Null
    Add-Card $slide 670 232 242 94 "Trabajo coordinado" "Casos, citas y seguimientos en el mismo panel." $colors.Teal | Out-Null
    Add-Card $slide 670 340 242 94 "Visión por canal" "Distribución y volumen sin revisar varias bandejas." $colors.Green | Out-Null

    $slide = Add-SlideBase $presentation "04 · ASISTENTE" "De un mensaje a una respuesta accionable"
    Add-PictureContained $slide (Join-Path $assets "detalle-caso-demo.png") 48 124 590 308
    Add-Card $slide 670 124 242 94 "Comprensión rápida" "Resumen, intención, prioridad y categoría." $colors.Orange | Out-Null
    Add-Card $slide 670 232 242 94 "Información faltante" "El equipo sabe qué necesita preguntar antes de actuar." $colors.Teal | Out-Null
    Add-Card $slide 670 340 242 94 "Borrador editable" "La IA prepara; la persona revisa, adapta y decide." $colors.Green | Out-Null

    $slide = Add-SlideBase $presentation "05 · CAPACIDADES" "Qué puede demostrar COPPE hoy"
    $capabilities = @(
      @("Multiempresa y roles", "Aislamiento por empresa, propietario y miembros"),
      @("Clientes y casos", "Historial, estados, filtros, prioridades y canales"),
      @("Trabajo operativo", "Responsables, notas, citas y seguimientos"),
      @("Asistente", "Motor local o OpenAI, con revisión humana"),
      @("Canales web", "Formulario y chat públicos por empresa"),
      @("Control", "MFA, auditoría, exportación y límites de API")
    )
    for ($index = 0; $index -lt $capabilities.Count; $index++) {
      $column = $index % 3
      $row = [Math]::Floor($index / 3)
      Add-Card $slide (48 + $column * 292) (132 + $row * 144) 266 118 $capabilities[$index][0] $capabilities[$index][1] $(if ($index % 2 -eq 0) { $colors.Teal } else { $colors.Orange }) | Out-Null
    }
    Add-TextBox $slide "Email y WhatsApp se activan y validan durante el onboarding; no se prometen antes de comprobar proveedor, dominio y permisos." 80 436 800 42 13 $colors.Muted $false 2 | Out-Null

    $slide = Add-SlideBase $presentation "06 · SEGURIDAD" "Control técnico sin vender humo"
    Add-Card $slide 48 130 266 105 "Aislamiento" "RLS y comprobaciones explícitas de pertenencia." $colors.Teal | Out-Null
    Add-Card $slide 347 130 266 105 "Acceso" "Roles y MFA TOTP para proteger cuentas." $colors.Orange | Out-Null
    Add-Card $slide 646 130 266 105 "Trazabilidad" "Auditoría de acciones y autoría operativa." $colors.Green | Out-Null
    Add-Card $slide 48 260 266 105 "Portabilidad" "Exportación por empresa y offboarding administrado." $colors.Green | Out-Null
    Add-Card $slide 347 260 266 105 "APIs críticas" "Rate limits, firmas, idempotencia y conciliación." $colors.Teal | Out-Null
    Add-Card $slide 646 260 266 105 "Producción" "Copias, monitorización y contratos antes de datos reales." $colors.Orange | Out-Null
    Add-Rectangle $slide 112 408 736 58 $colors.Pale $colors.Border 0.12 | Out-Null
    Add-TextBox $slide "Sin certificaciones inventadas: ISO, SOC 2 y SLA solo se declaran cuando existan." 140 426 680 24 15 $colors.Teal $true 2 | Out-Null

    $slide = Add-SlideBase $presentation "07 · PILOTO" "Una prueba pagada, acotada y medible"
    Add-Rectangle $slide 48 128 330 308 $colors.Ink $colors.Ink 0.12 | Out-Null
    Add-TextBox $slide "30 días" 82 158 260 52 34 $colors.White $true 2 "Aptos Display" | Out-Null
    Add-TextBox $slide "1.500 € + IVA" 82 228 260 52 28 $colors.Orange $true 2 "Aptos Display" | Out-Null
    Add-TextBox $slide "Se imputa al onboarding si el piloto se convierte en contrato anual." 90 306 244 74 14 (Get-Rgb 205 226 229) $false 2 | Out-Null
    Add-Card $slide 416 128 228 138 "Alcance" "Un equipo · hasta 10 usuarios · hasta 1.000 casos." $colors.Teal | Out-Null
    Add-Card $slide 674 128 238 138 "Incluye" "Configuración, formación, revisión semanal e informe final." $colors.Green | Out-Null
    Add-Card $slide 416 292 228 144 "Medimos" "Primera revisión, casos sin responsable, vencidos y resolución." $colors.Orange | Out-Null
    Add-Card $slide 674 292 238 144 "Después" "Professional: 399 € + IVA/mes, sujeto a contrato final." $colors.Teal | Out-Null

    $slide = Add-SlideBase $presentation "08 · ACTIVACIÓN" "Del sí comercial al primer piloto"
    $activationSteps = @(
      @("1", "Pedido condicionado", "Alcance, precio y plazo sin cobrar todavía"),
      @("2", "Entidad y contratos", "S.L.U., NIF, SaaS, DPA y soporte"),
      @("3", "Entorno profesional", "Planes comerciales, copias y monitorización"),
      @("4", "Onboarding", "Usuarios, canales, formación y datos autorizados"),
      @("5", "Piloto", "30 días, métricas y decisión de continuidad")
    )
    for ($index = 0; $index -lt $activationSteps.Count; $index++) {
      $top = 126 + $index * 70
      Add-Rectangle $slide 74 $top 52 52 $(if ($index -eq 0) { $colors.Orange } else { $colors.Teal }) $(if ($index -eq 0) { $colors.Orange } else { $colors.Teal }) 0.3 | Out-Null
      Add-TextBox $slide $activationSteps[$index][0] 74 ($top + 14) 52 22 16 $colors.White $true 2 | Out-Null
      Add-TextBox $slide $activationSteps[$index][1] 154 ($top + 2) 250 26 16 $colors.Ink $true | Out-Null
      Add-TextBox $slide $activationSteps[$index][2] 154 ($top + 30) 650 25 12 $colors.Muted $false | Out-Null
      if ($index -lt 4) {
        Add-Rectangle $slide 98 ($top + 52) 4 18 $colors.Border $colors.Border | Out-Null
      }
    }

    $slide = $presentation.Slides.Add($presentation.Slides.Count + 1, 12)
    Add-Rectangle $slide 0 0 960 540 $colors.Teal $colors.Teal | Out-Null
    Add-Rectangle $slide 0 0 14 540 $colors.Orange $colors.Orange | Out-Null
    Add-TextBox $slide "Siguiente paso" 64 74 420 42 16 (Get-Rgb 205 226 229) $true | Out-Null
    Add-TextBox $slide "Sesión de descubrimiento de 45 minutos" 64 138 770 110 34 $colors.White $true 1 "Aptos Display" | Out-Null
    Add-TextBox $slide "Definimos proceso, volumen, canales, responsables y métricas. Después entregamos una propuesta de piloto cerrada." 64 284 730 76 18 (Get-Rgb 220 237 239) $false | Out-Null
    Add-Rectangle $slide 64 408 320 54 $colors.Orange $colors.Orange 0.15 | Out-Null
    Add-TextBox $slide "COPPE · app.coppe.es" 86 422 276 24 16 $colors.White $true | Out-Null

    $pptxPath = Join-Path $output "COPPE_Presentacion_Comercial.pptx"
    $pdfPath = Join-Path $output "COPPE_Presentacion_Comercial.pdf"
    $presentation.SaveAs($pptxPath, 24)
    $presentation.SaveAs($pdfPath, 32)
  }
  finally {
    if ($presentation) {
      $presentation.Close()
      [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($presentation)
    }
    $powerPoint.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint)
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
  }
}

function Export-HtmlToPdf {
  param(
    [string]$HtmlPath,
    [string]$PdfName
  )

  $chromeCandidates = @(
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe")
  )
  $chrome = $chromeCandidates |
    Where-Object { $_ -and (Test-Path $_) } |
    Select-Object -First 1

  if (-not $chrome) {
    throw "No se ha encontrado Google Chrome para exportar el PDF."
  }

  $pdfPath = Join-Path $output $PdfName
  $htmlUri = ([System.Uri](Resolve-Path $HtmlPath).Path).AbsoluteUri
  $process = Start-Process `
    -FilePath $chrome `
    -ArgumentList @(
      "--headless",
      "--disable-gpu",
      "--no-pdf-header-footer",
      "--print-to-pdf=$pdfPath",
      $htmlUri
    ) `
    -WindowStyle Hidden `
    -PassThru `
    -Wait

  if ($process.ExitCode -ne 0 -or -not (Test-Path $pdfPath)) {
    throw "Chrome no pudo generar $PdfName."
  }
}

New-CommercialPresentation
Export-HtmlToPdf `
  -HtmlPath (Join-Path $presentationRoot "COPPE_Dossier_Comercial.html") `
  -PdfName "COPPE_Dossier_Comercial.pdf"
Export-HtmlToPdf `
  -HtmlPath (Join-Path $presentationRoot "COPPE_Resumen_Ejecutivo.html") `
  -PdfName "COPPE_Resumen_Ejecutivo.pdf"

Write-Output "Material comercial generado en $output"
