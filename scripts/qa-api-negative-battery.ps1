#requires -Version 5.1
<#
.SYNOPSIS
  Bateria de testes negativos da API Barbearia SaaS — gera CSV em docs/QA_API_NEGATIVE_BATTERY_RESULTS.csv
  Uso: .\scripts\qa-api-negative-battery.ps1 [-BaseUrl http://localhost:3000]
#>
param(
  [string]$BaseUrl = 'http://localhost:3000',
  [string]$AdminEmail = 'admin@demo.local',
  [string]$AdminPassword = 'admin12345'
)

$ErrorActionPreference = 'Stop'
# Nome explícito: $api pode colidir / ser interpretado incorretamente com '&' em URLs no parser PS.
$ApiRoot = ($BaseUrl.TrimEnd('/') + '/api/v1')
$rows = New-Object System.Collections.ArrayList

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Url,
    [hashtable]$Headers = @{},
    [string]$Body = $null
  )
  $h = @{}
  foreach ($k in $Headers.Keys) { $h[$k] = $Headers[$k] }
  try {
    $p = @{ Uri = $Url; Method = $Method; Headers = $h; UseBasicParsing = $true }
    # GET/HEAD não podem ter corpo; evita erro do .NET ("Não é possível enviar um conteúdo com este tipo de verbo").
    $verb = $Method.ToUpperInvariant()
    if ($verb -notin @('GET', 'HEAD') -and $null -ne $Body -and $Body -ne '') {
      $p.ContentType = 'application/json'
      $p.Body = $Body
    }
    $r = Invoke-WebRequest @p
    return @{ Status = $r.StatusCode; Content = $r.Content }
  }
  catch {
    $ex = $_.Exception
    $resp = $ex.Response
    $text = ''
    if ($resp) {
      try {
        $stream = $resp.GetResponseStream()
        if ($stream) {
          $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
          $text = $reader.ReadToEnd()
        }
      }
      catch { }
    }
    if (-not $text -and $ex.ErrorDetails -and $ex.ErrorDetails.Message) {
      $text = [string]$ex.ErrorDetails.Message
    }
    if ($resp -and $null -ne $resp.StatusCode) {
      return @{ Status = [int]$resp.StatusCode; Content = $text }
    }
    return @{ Status = 0; Content = $ex.Message }
  }
}

function Invoke-LoginWithRetry([string]$Url, [string]$Body) {
  $max = 5
  $delay = 65
  for ($i = 1; $i -le $max; $i++) {
    $L = Invoke-Api POST $Url @{} $Body
    if ($L.Status -eq 200) { return $L }
    if ($L.Status -eq 429 -and $i -lt $max) {
      Write-Warning "auth/login HTTP 429; aguardando ${delay}s ($i/$max)..."
      Start-Sleep -Seconds $delay
      continue
    }
    return $L
  }
}

function Add-Row {
  param(
    [string]$Id,
    [string]$Name,
    [string]$Method,
    [string]$Url,
    [string]$Expected,
    [int]$Status,
    [string]$BodyShort,
    [string]$RespShort,
    [string]$Verdict,
    [string]$Note = ''
  )
  if ($RespShort.Length -gt 500) { $RespShort = $RespShort.Substring(0, 500) + '...' }
  if ($BodyShort.Length -gt 300) { $BodyShort = $BodyShort.Substring(0, 300) + '...' }
  [void]$rows.Add([pscustomobject]@{
      CT = $Id; Cenario = $Name; Method = $Method; Url = $Url
      Esperado = $Expected; Obtido = $Status; Body = $BodyShort; Response = $RespShort
      Verdict = $Verdict; Nota = $Note
    })
}

function ApptJson {
  param([hashtable]$Fields)
  $base = [ordered]@{
    customer_id             = $script:customerId
    professional_id         = $script:professionalId
    service_id              = $script:serviceId
    starts_at               = $script:slotStart
    ends_at                 = $script:slotEnd
    idempotency_key         = "qa-neg-$([guid]::NewGuid().ToString('N').Substring(0, 12))"
    explicit_confirmation   = $true
    source                  = 'manual'
    notes                   = 'QA negativo'
  }
  foreach ($k in $Fields.Keys) {
    if ($null -eq $Fields[$k]) { $base.Remove($k) } else { $base[$k] = $Fields[$k] }
  }
  return ($base | ConvertTo-Json -Compress -Depth 5)
}

# --- Login ---
$loginBody = (@{ email = $AdminEmail; password = $AdminPassword; tenant_id = '00000000-0000-0000-0000-000000000001' } | ConvertTo-Json -Compress)
$L = Invoke-LoginWithRetry "$BaseUrl/auth/login" $loginBody
if ($L.Status -ne 200) { Write-Error "Login falhou: $($L.Status) $($L.Content)"; exit 2 }
$ownerToken = ($L.Content | ConvertFrom-Json).access_token
$tenantId = '00000000-0000-0000-0000-000000000001'
$H = @{ Authorization = "Bearer $ownerToken"; 'x-tenant-id' = $tenantId }

$svcList = (Invoke-Api GET ($ApiRoot + '/services?page=1&limit=20') $H).Content | ConvertFrom-Json
$proList = (Invoke-Api GET ($ApiRoot + '/professionals?page=1&limit=20') $H).Content | ConvertFrom-Json
$custList = (Invoke-Api GET ($ApiRoot + '/customers?page=1&limit=20') $H).Content | ConvertFrom-Json

$pro = $proList.data | Where-Object { $_.service_ids -and $_.service_ids.Count -gt 0 } | Select-Object -First 1
if (-not $pro) { $pro = $proList.data[0] }
$script:professionalId = $pro.id
$script:serviceId = $pro.service_ids[0]
$script:customerId = ($custList.data | Select-Object -First 1).id

function Next-WeekdayDateNeg([int]$MinDaysAhead) {
  $d = [DateTime]::UtcNow.Date.AddDays($MinDaysAhead)
  while ($d.DayOfWeek -eq [DayOfWeek]::Sunday) { $d = $d.AddDays(1) }
  return $d.ToString('yyyy-MM-dd')
}

function Find-AvailabilityPick([hashtable]$Headers, [string]$ProId, [string]$SvcId, [int]$MinSlots, [int]$StartDay, [int]$MaxDay, [string[]]$ExcludeDates) {
  $ex = @{}
  foreach ($x in $ExcludeDates) { if ($x) { $ex[$x] = $true } }
  for ($i = $StartDay; $i -le $MaxDay; $i += 3) {
    $ds = Next-WeekdayDateNeg $i
    if ($ex.ContainsKey($ds)) { continue }
    $u = $ApiRoot + '/availability?professional_id=' + $ProId + '&service_id=' + $SvcId + '&date=' + $ds + '&min_advance_minutes=0&max_slots=50'
    $avMainResp = Invoke-Api GET $u $Headers
    if ($avMainResp.Status -ne 200) { continue }
    $av = $avMainResp.Content | ConvertFrom-Json
    if ($av.slots -and $av.slots.Count -ge $MinSlots) {
      return @{ DateStr = $ds; Slots = $av.slots }
    }
  }
  return $null
}

# Slots reais: datas fixas esgotam-se após muitas baterias — procurar janela com massa suficiente.
$mainPick = Find-AvailabilityPick $H $script:professionalId $script:serviceId 4 7 240 @()
if (-not $mainPick) {
  Write-Error "availability: nenhuma data com >=4 slots (pro=$script:professionalId svc=$script:serviceId)"
  exit 3
}
$availDateMain = $mainPick.DateStr
$script:slotStart = $mainPick.Slots[0].starts_at
$script:slotEnd = $mainPick.Slots[0].ends_at

$p76 = Find-AvailabilityPick $H $script:professionalId $script:serviceId 1 14 260 @($availDateMain)
if (-not $p76) { Write-Error 'availability CT-076: sem dia com slot'; exit 3 }
$ct76Date = $p76.DateStr
$slot76s = $p76.Slots[0].starts_at
$slot76e = $p76.Slots[0].ends_at
$ts76 = [DateTimeOffset]::Parse($slot76s, $null, [System.Globalization.DateTimeStyles]::RoundtripKind)
$slot77s = $ts76.AddMinutes(15).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
$slot77e = $ts76.AddMinutes(45).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')

$p80 = Find-AvailabilityPick $H $script:professionalId $script:serviceId 1 21 280 @($availDateMain, $ct76Date)
if (-not $p80) { Write-Error 'availability CT-080: sem dia com slot'; exit 3 }
$ct80Date = $p80.DateStr
$slot80s = $p80.Slots[0].starts_at
$slot80e = $p80.Slots[0].ends_at

$p81 = Find-AvailabilityPick $H $script:professionalId $script:serviceId 2 28 300 @($availDateMain, $ct76Date, $ct80Date)
if (-not $p81) { Write-Error 'availability CT-081: sem dia com 2+ slots'; exit 3 }
$ct81Date = $p81.DateStr
$slot81aS = $p81.Slots[0].starts_at
$slot81aE = $p81.Slots[0].ends_at
$slot81bS = $p81.Slots[1].starts_at
$slot81bE = $p81.Slots[1].ends_at

$p114 = Find-AvailabilityPick $H $script:professionalId $script:serviceId 1 35 320 @($availDateMain, $ct76Date, $ct80Date, $ct81Date)
if (-not $p114) { Write-Error 'availability CT-114: sem dia com slot'; exit 3 }
$ct114Date = $p114.DateStr
$slot114s = $p114.Slots[0].starts_at
$slot114e = $p114.Slots[0].ends_at

Write-Host "Massa: pro=$script:professionalId svc=$script:serviceId cust=$script:customerId slot=$script:slotStart->$script:slotEnd"

# BLOCO 0
$x = Invoke-Api GET "$BaseUrl/health" @{}
Add-Row 'CT-000' 'Health API' 'GET' "$BaseUrl/health" '200' $x.Status '' $x.Content $(if ($x.Status -eq 200) { 'OK' } else { 'FALHA' })
$x = Invoke-Api GET "$BaseUrl/database/health" @{}
Add-Row 'CT-001' 'Database health' 'GET' "$BaseUrl/database/health" '200' $x.Status '' $x.Content $(if ($x.Status -eq 200) { 'OK' } else { 'FALHA' })

# BLOCO 1
$x = Invoke-Api GET ($ApiRoot + '/services') @{}
Add-Row 'CT-010' 'GET services sem token' 'GET' ($ApiRoot + '/services') '401' $x.Status '' $x.Content $(if ($x.Status -eq 401) { 'OK' } else { 'FALHA' })
$x = Invoke-Api GET ($ApiRoot + '/services') @{ Authorization = 'Bearer token_invalido_xyz' }
Add-Row 'CT-011' 'GET services token invalido' 'GET' ($ApiRoot + '/services') '401' $x.Status '' $x.Content $(if ($x.Status -eq 401) { 'OK' } else { 'FALHA' })
$x = Invoke-Api POST ($ApiRoot + '/appointments') @{} (ApptJson @{})
Add-Row 'CT-012' 'POST appointments sem token' 'POST' ($ApiRoot + '/appointments') '401' $x.Status '(body valido)' $x.Content $(if ($x.Status -eq 401) { 'OK' } else { 'FALHA' })

# BLOCO 2
$x = Invoke-Api GET ($ApiRoot + '/services') @{ Authorization = "Bearer $ownerToken" }
Add-Row 'CT-020' 'GET services sem x-tenant-id' 'GET' ($ApiRoot + '/services') '200' $x.Status '' $x.Content $(if ($x.Status -eq 200) { 'OK' } elseif ($x.Status -in @(401, 403)) { 'FALHA' } else { 'FALHA' }) 'JWT com tenant_id resolve tenant (prioridade documentada)'
$x = Invoke-Api GET ($ApiRoot + '/services') @{ Authorization = "Bearer $ownerToken"; 'x-tenant-id' = '00000000-0000-0000-0000-000000000000' }
Add-Row 'CT-021' 'GET services tenant header nil' 'GET' ($ApiRoot + '/services') '403' $x.Status '' $x.Content $(if ($x.Status -eq 403) { 'OK' } else { 'FALHA' })
$x = Invoke-Api GET ($ApiRoot + '/services') @{ Authorization = "Bearer $ownerToken"; 'x-tenant-id' = '11111111-1111-4111-8111-111111111111' }
Add-Row 'CT-022' 'GET services cross-tenant' 'GET' ($ApiRoot + '/services') '403' $x.Status '' $x.Content $(if ($x.Status -eq 403) { 'OK' } else { 'FALHA' })

# BLOCO 3
$x = Invoke-Api GET ($ApiRoot + '/tenants') $H
Add-Row 'CT-030' 'GET tenants tenant_owner' 'GET' ($ApiRoot + '/tenants') '403' $x.Status '' $x.Content $(if ($x.Status -eq 403) { 'OK' } else { 'FALHA' })
$tc = (@{ legal_name = 'X'; trade_name = 'Y'; document = '99999999000199'; plan_code = 'trial' } | ConvertTo-Json -Compress)
$x = Invoke-Api POST ($ApiRoot + '/tenants') $H $tc
Add-Row 'CT-031' 'POST tenants tenant_owner' 'POST' ($ApiRoot + '/tenants') '403' $x.Status $tc $x.Content $(if ($x.Status -eq 403) { 'OK' } else { 'FALHA' })

# BLOCO 4
$x = Invoke-Api POST ($ApiRoot + '/services') $H (@{ duration_minutes = 30; price_cents = 5000 } | ConvertTo-Json -Compress)
Add-Row 'CT-040' 'POST service sem nome' 'POST' ($ApiRoot + '/services') '400' $x.Status '{}' $x.Content $(if ($x.Status -eq 400) { 'OK' } else { 'FALHA' })
$x = Invoke-Api POST ($ApiRoot + '/services') $H (@{ name = 'Inv'; duration_minutes = 0; price_cents = 5000 } | ConvertTo-Json -Compress)
Add-Row 'CT-041' 'POST service duracao 0' 'POST' ($ApiRoot + '/services') '400' $x.Status '{}' $x.Content $(if ($x.Status -eq 400) { 'OK' } else { 'FALHA' })
$x = Invoke-Api POST ($ApiRoot + '/services') $H (@{ name = 'Inv2'; duration_minutes = 30; price_cents = -100 } | ConvertTo-Json -Compress)
Add-Row 'CT-042' 'POST service preco negativo' 'POST' ($ApiRoot + '/services') '400' $x.Status '{}' $x.Content $(if ($x.Status -eq 400) { 'OK' } else { 'FALHA' })
$x = Invoke-Api GET ($ApiRoot + '/services/00000000-0000-0000-0000-000000000000') $H
Add-Row 'CT-043' 'GET service inexistente' 'GET' ($ApiRoot + '/services/00000000-0000-0000-0000-000000000000') '404' $x.Status '' $x.Content $(if ($x.Status -eq 404) { 'OK' } else { 'FALHA' })

# BLOCO 5
$x = Invoke-Api GET ($ApiRoot + '/availability?service_id=' + $script:serviceId + '&date=2026-05-20') $H
Add-Row 'CT-050' 'availability sem professional_id' 'GET' ($ApiRoot + '/availability') '400' $x.Status '' $x.Content $(if ($x.Status -eq 400) { 'OK' } else { 'FALHA' })
$x = Invoke-Api GET ($ApiRoot + '/availability?professional_id=' + $script:professionalId + '&date=2026-05-20') $H
Add-Row 'CT-051' 'availability sem service_id' 'GET' ($ApiRoot + '/availability') '400' $x.Status '' $x.Content $(if ($x.Status -eq 400) { 'OK' } else { 'FALHA' })
$x = Invoke-Api GET ($ApiRoot + '/availability?professional_id=' + $script:professionalId + '&service_id=' + $script:serviceId + '&date=INVALID') $H
Add-Row 'CT-052' 'availability data invalida' 'GET' ($ApiRoot + '/availability') '400' $x.Status '' $x.Content $(if ($x.Status -eq 400) { 'OK' } else { 'FALHA' })
$x = Invoke-Api GET ($ApiRoot + '/availability?professional_id=00000000-0000-0000-0000-000000000000&service_id=' + $script:serviceId + '&date=2026-05-20') $H
Add-Row 'CT-053' 'availability prof inexistente' 'GET' ($ApiRoot + '/availability') '404' $x.Status '' $x.Content $(if ($x.Status -in @(400, 404)) { 'OK' } else { 'FALHA' })
$x = Invoke-Api GET ($ApiRoot + '/availability?professional_id=' + $script:professionalId + '&service_id=00000000-0000-0000-0000-000000000000&date=2026-05-20') $H
Add-Row 'CT-054' 'availability service inexistente' 'GET' ($ApiRoot + '/availability') '404' $x.Status '' $x.Content $(if ($x.Status -in @(400, 404)) { 'OK' } else { 'FALHA' })

# BLOCO 6 appointments
function Post-Appt([hashtable]$o) {
  $j = ApptJson $o
  return (Invoke-Api POST ($ApiRoot + '/appointments') $H $j), $j
}

$x, $b = Post-Appt @{ customer_id = $null }
Add-Row 'CT-060' 'appointment sem customer_id' 'POST' ($ApiRoot + '/appointments') '400' $x.Status $b $x.Content $(if ($x.Status -eq 400) { 'OK' } else { 'FALHA' })
$x, $b = Post-Appt @{ professional_id = $null }
Add-Row 'CT-061' 'appointment sem professional_id' 'POST' ($ApiRoot + '/appointments') '400' $x.Status $b $x.Content $(if ($x.Status -eq 400) { 'OK' } else { 'FALHA' })
$x, $b = Post-Appt @{ service_id = $null }
Add-Row 'CT-062' 'appointment sem service_id' 'POST' ($ApiRoot + '/appointments') '400' $x.Status $b $x.Content $(if ($x.Status -eq 400) { 'OK' } else { 'FALHA' })
$x, $b = Post-Appt @{ starts_at = $null }
Add-Row 'CT-063' 'appointment sem starts_at' 'POST' ($ApiRoot + '/appointments') '400' $x.Status $b $x.Content $(if ($x.Status -eq 400) { 'OK' } else { 'FALHA' })
$x, $b = Post-Appt @{ ends_at = $null }
Add-Row 'CT-064' 'appointment sem ends_at' 'POST' ($ApiRoot + '/appointments') '400' $x.Status $b $x.Content $(if ($x.Status -eq 400) { 'OK' } else { 'FALHA' })
$x, $b = Post-Appt @{ idempotency_key = $null }
Add-Row 'CT-065' 'appointment sem idempotency_key' 'POST' ($ApiRoot + '/appointments') '400' $x.Status $b $x.Content $(if ($x.Status -in @(400, 422)) { 'OK' } else { 'FALHA' })

$x, $b = Post-Appt @{ customer_id = '00000000-0000-0000-0000-000000000000'; idempotency_key = "qa-ct066-$([guid]::NewGuid().ToString('N').Substring(0, 8))" }
Add-Row 'CT-066' 'customer inexistente' 'POST' ($ApiRoot + '/appointments') '400/404' $x.Status $b $x.Content $(if ($x.Status -lt 500 -and $x.Status -ne 201) { 'OK' } elseif ($x.Status -ge 500) { 'BUG-500' } else { 'FALHA' })

$x, $b = Post-Appt @{ professional_id = '00000000-0000-0000-0000-000000000000'; idempotency_key = "qa-ct067-$([guid]::NewGuid().ToString('N').Substring(0, 8))" }
Add-Row 'CT-067' 'professional inexistente' 'POST' ($ApiRoot + '/appointments') '400/404' $x.Status $b $x.Content $(if ($x.Status -in @(400, 404)) { 'OK' } elseif ($x.Status -ge 500) { 'BUG-500' } else { 'FALHA' })

$x, $b = Post-Appt @{ service_id = '00000000-0000-0000-0000-000000000000'; idempotency_key = "qa-ct068-$([guid]::NewGuid().ToString('N').Substring(0, 8))" }
Add-Row 'CT-068' 'service inexistente' 'POST' ($ApiRoot + '/appointments') '400/404' $x.Status $b $x.Content $(if ($x.Status -in @(400, 404)) { 'OK' } elseif ($x.Status -ge 500) { 'BUG-500' } else { 'FALHA' })

$x, $b = Post-Appt @{
  starts_at       = '2026-05-20T15:00:00-03:00'
  ends_at         = '2026-05-20T14:30:00-03:00'
  idempotency_key = "qa-ct069-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
}
Add-Row 'CT-069' 'horario invertido' 'POST' ($ApiRoot + '/appointments') '400/422' $x.Status $b $x.Content $(if ($x.Status -lt 500 -and $x.Status -ne 201) { 'OK' } elseif ($x.Status -ge 500) { 'BUG-500' } else { 'FALHA' })

$x, $b = Post-Appt @{
  starts_at       = '2026-05-20T15:00:00-03:00'
  ends_at         = '2026-05-20T15:00:00-03:00'
  idempotency_key = "qa-ct070-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
}
Add-Row 'CT-070' 'duracao zero' 'POST' ($ApiRoot + '/appointments') '400/422' $x.Status $b $x.Content $(if ($x.Status -lt 500 -and $x.Status -ne 201) { 'OK' } elseif ($x.Status -ge 500) { 'BUG-500' } else { 'FALHA' })

$x, $b = Post-Appt @{
  starts_at       = '2025-01-10T13:00:00.000Z'
  ends_at         = '2025-01-10T13:30:00.000Z'
  idempotency_key = "qa-ct071-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
}
Add-Row 'CT-071' 'appointment no passado' 'POST' ($ApiRoot + '/appointments') '422' $x.Status $b $x.Content $(if ($x.Status -eq 422) { 'OK' } elseif ($x.Status -eq 201) { 'FALHA' } else { 'FALHA' })

$o72 = [ordered]@{
  customer_id = $script:customerId; professional_id = $script:professionalId; service_id = $script:serviceId
  starts_at = $script:slotStart; ends_at = $script:slotEnd; idempotency_key = "qa-ct072-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
  source = 'manual'; notes = 'x'
}
$j72 = ($o72 | ConvertTo-Json -Compress)
$x = Invoke-Api POST ($ApiRoot + '/appointments') $H $j72
Add-Row 'CT-072' 'sem explicit_confirmation' 'POST' ($ApiRoot + '/appointments') '400' $x.Status $j72 $x.Content $(if ($x.Status -eq 400) { 'OK' } else { 'GAP' })

# CT-073-B antes de CT-073: o owner com explicit_confirmation=false ocupa o slot principal; senão o atendente recebe 409 por conflito em vez de 403.
$loginAttBody = (@{ email = 'atendente@demo.local'; password = $AdminPassword; tenant_id = $tenantId } | ConvertTo-Json -Compress)
$LAtt = Invoke-LoginWithRetry "$BaseUrl/auth/login" $loginAttBody
if ($LAtt.Status -ne 200) {
  Add-Row 'CT-073-B' 'explicit_confirmation false (atendente)' 'POST' ($ApiRoot + '/appointments') '403' 0 '' $LAtt.Content 'FALHA' 'Login atendente@demo.local falhou'
}
else {
  $attendantToken = ($LAtt.Content | ConvertFrom-Json).access_token
  $HAtt = @{ Authorization = "Bearer $attendantToken"; 'x-tenant-id' = $tenantId }
  $jb = ApptJson @{ explicit_confirmation = $false; idempotency_key = "qa-ct073b-$([guid]::NewGuid().ToString('N').Substring(0, 10))" }
  $xb = Invoke-Api POST ($ApiRoot + '/appointments') $HAtt $jb
  Add-Row 'CT-073-B' 'explicit_confirmation false (atendente)' 'POST' ($ApiRoot + '/appointments') '403' $xb.Status $jb $xb.Content $(if ($xb.Status -eq 403) { 'OK' } elseif ($xb.Status -eq 201) { 'FALHA' } elseif ($xb.Status -eq 409) { 'FALHA' } else { 'FALHA' }) 'CT-073-B: comum/balcão sem privilégio administrativo'
}

$x, $b = Post-Appt @{ explicit_confirmation = $false; idempotency_key = "qa-ct073-$([guid]::NewGuid().ToString('N').Substring(0, 8))" }
Add-Row 'CT-073' 'explicit_confirmation false (tenant_owner)' 'POST' ($ApiRoot + '/appointments') '201' $x.Status $b $x.Content $(if ($x.Status -eq 201) { 'OK' } elseif ($x.Status -in @(400, 403, 422)) { 'FALHA' } else { 'FALHA' }) 'Criação administrativa documentada'

$x, $b = Post-Appt @{ source = 'origem_invalida'; idempotency_key = "qa-ct074-$([guid]::NewGuid().ToString('N').Substring(0, 8))" }
Add-Row 'CT-074' 'source invalido' 'POST' ($ApiRoot + '/appointments') '400' $x.Status $b $x.Content $(if ($x.Status -eq 400) { 'OK' } else { 'FALHA' })

$x, $b = Post-Appt @{
  starts_at       = '2026-05-19T06:00:00.000Z'
  ends_at         = '2026-05-19T06:30:00.000Z'
  idempotency_key = "qa-ct075-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
}
Add-Row 'CT-075' 'fora horario comercial' 'POST' ($ApiRoot + '/appointments') '409' $x.Status $b $x.Content $(if ($x.Status -eq 409) { 'OK' } elseif ($x.Status -eq 201) { 'GAP' } else { 'FALHA' })

$idem76 = "qa-ct076-$([guid]::NewGuid().ToString('N').Substring(0, 10))"
$b76a = (@{
    customer_id = $script:customerId; professional_id = $script:professionalId; service_id = $script:serviceId
    starts_at = $slot76s; ends_at = $slot76e; idempotency_key = $idem76
    explicit_confirmation = $true; source = 'manual'
  } | ConvertTo-Json -Compress)
$r76a = Invoke-Api POST ($ApiRoot + '/appointments') $H $b76a
$b76b = (@{
    customer_id = $script:customerId; professional_id = $script:professionalId; service_id = $script:serviceId
    starts_at = $slot76s; ends_at = $slot76e; idempotency_key = "qa-ct076b-$([guid]::NewGuid().ToString('N').Substring(0, 10))"
    explicit_confirmation = $true; source = 'manual'
  } | ConvertTo-Json -Compress)
$r76b = Invoke-Api POST ($ApiRoot + '/appointments') $H $b76b
Add-Row 'CT-076' 'overbooking mesmo slot' 'POST' ($ApiRoot + '/appointments') '409' $r76b.Status $b76b $r76b.Content $(if ($r76a.Status -eq 201 -and $r76b.Status -eq 409) { 'OK' } else { "FALHA a=$($r76a.Status) b=$($r76b.Status)" })

$b77 = (@{
    customer_id = $script:customerId; professional_id = $script:professionalId; service_id = $script:serviceId
    starts_at = $slot77s; ends_at = $slot77e; idempotency_key = "qa-ct077-$([guid]::NewGuid().ToString('N').Substring(0, 10))"
    explicit_confirmation = $true; source = 'manual'
  } | ConvertTo-Json -Compress)
$r77 = Invoke-Api POST ($ApiRoot + '/appointments') $H $b77
Add-Row 'CT-077' 'conflito parcial' 'POST' ($ApiRoot + '/appointments') '409' $r77.Status $b77 $r77.Content $(if ($r77.Status -eq 409) { 'OK' } else { 'FALHA' })

# CT-080 / 081
$idem80 = "qa-idem-same-$([guid]::NewGuid().ToString('N').Substring(0, 10))"
$b80 = (@{
    customer_id = $script:customerId; professional_id = $script:professionalId; service_id = $script:serviceId
    starts_at = $slot80s; ends_at = $slot80e; idempotency_key = $idem80
    explicit_confirmation = $true; source = 'manual'
  } | ConvertTo-Json -Compress)
$a1 = Invoke-Api POST ($ApiRoot + '/appointments') $H $b80
$a2 = Invoke-Api POST ($ApiRoot + '/appointments') $H $b80
$id1 = if ($a1.Content) { try { ($a1.Content | ConvertFrom-Json).id } catch { $null } } else { $null }
$id2 = if ($a2.Content) { try { ($a2.Content | ConvertFrom-Json).id } catch { $null } } else { $null }
$idemOk = ($a1.Status -eq 201) -and ($a2.Status -in @(200, 201)) -and $id1 -and $id2 -and ($id1 -eq $id2)
Add-Row 'CT-080' 'idempotencia mesmo body' 'POST' ($ApiRoot + '/appointments') '201+201 mesmo id' $a2.Status $b80 $a2.Content $(if ($idemOk) { 'OK' } else { "FALHA s1=$($a1.Status) s2=$($a2.Status) id1=$id1 id2=$id2" }) "Replay idempotente: 2a chamada devolve o mesmo agendamento"

$idem81 = "qa-idem-diff-$([guid]::NewGuid().ToString('N').Substring(0, 10))"
$b81a = (@{
    customer_id = $script:customerId; professional_id = $script:professionalId; service_id = $script:serviceId
    starts_at = $slot81aS; ends_at = $slot81aE; idempotency_key = $idem81
    explicit_confirmation = $true; source = 'manual'
  } | ConvertTo-Json -Compress)
$null = Invoke-Api POST ($ApiRoot + '/appointments') $H $b81a
$b81b = (@{
    customer_id = $script:customerId; professional_id = $script:professionalId; service_id = $script:serviceId
    starts_at = $slot81bS; ends_at = $slot81bE; idempotency_key = $idem81
    explicit_confirmation = $true; source = 'manual'
  } | ConvertTo-Json -Compress)
$z2 = Invoke-Api POST ($ApiRoot + '/appointments') $H $b81b
Add-Row 'CT-081' 'idempotencia body diferente' 'POST' ($ApiRoot + '/appointments') '409' $z2.Status $b81b $z2.Content $(if ($z2.Status -eq 409) { 'OK' } else { 'FALHA' })

# BLOCO 8 webhook
$wh = "$BaseUrl/webhooks/whatsapp/inbound"
$whInst = 'demo-qa-inbound'
$whTok = 'demo_webhook_token_change_me'
$w = Invoke-Api POST $wh @{ 'x-webhook-instance' = 'nao-existe-qa' } (@{ phone = '5511999990001'; message = 'x'; external_message_id = 'e1' } | ConvertTo-Json -Compress)
Add-Row 'CT-090' 'webhook instancia desconhecida' 'POST' $wh '404' $w.Status '' $w.Content $(if ($w.Status -eq 404) { 'OK' } else { 'FALHA' })
$w = Invoke-Api POST $wh @{ 'x-webhook-instance' = $whInst; 'x-webhook-token' = $whTok } '{}'
Add-Row 'CT-091' 'webhook payload vazio' 'POST' $wh '400' $w.Status '{}' $w.Content $(if ($w.Status -eq 400) { 'OK' } else { 'FALHA' })
$w = Invoke-Api POST $wh @{ 'x-webhook-instance' = $whInst; 'x-webhook-token' = 'wrong' } (@{ phone = '5511999990001'; message = 'sem phone ok' } | ConvertTo-Json -Compress)
Add-Row 'CT-092' 'webhook token invalido' 'POST' $wh '401' $w.Status '' $w.Content $(if ($w.Status -eq 401) { 'OK' } else { 'FALHA' })
$w = Invoke-Api POST $wh @{ 'x-webhook-instance' = $whInst; 'x-webhook-token' = $whTok } (@{ message = 'sem phone' } | ConvertTo-Json -Compress)
Add-Row 'CT-092b' 'webhook sem phone' 'POST' $wh '400' $w.Status '' $w.Content $(if ($w.Status -eq 400) { 'OK' } else { 'FALHA' })

$mid93 = "qa-ct093-$([guid]::NewGuid().ToString('N'))"
$body93 = (@{ phone = '5511999999988'; message = 'dup inbound'; external_message_id = $mid93 } | ConvertTo-Json -Compress)
$whHdr = @{ 'x-webhook-instance' = $whInst; 'x-webhook-token' = $whTok }
$w93a = Invoke-Api POST $wh $whHdr $body93
$w93b = Invoke-Api POST $wh $whHdr $body93
$ok93 = ($w93a.Status -eq 200) -and ($w93b.Status -eq 200)
try {
  $j93b = $w93b.Content | ConvertFrom-Json
  $ok93 = $ok93 -and ($j93b.duplicate -eq $true)
}
catch { $ok93 = $false }
Add-Row 'CT-093' 'webhook message_id duplicado' 'POST' $wh '200+duplicate' $w93b.Status $body93 $w93b.Content $(if ($ok93) { 'OK' } else { 'FALHA' }) 'Segunda chamada idempotente (sem 500)'

$idemCt100 = "qa-ct100-$([guid]::NewGuid().ToString('N').Substring(0, 12))"
$outB1 = (@{ customer_id = $script:customerId; text = 'ct100-a'; idempotency_key = $idemCt100 } | ConvertTo-Json -Compress)
$r100a = Invoke-Api POST ($ApiRoot + '/integrations/outbound/whatsapp-text') $H $outB1
$outB2 = (@{ customer_id = $script:customerId; text = 'ct100-b'; idempotency_key = $idemCt100 } | ConvertTo-Json -Compress)
$r100b = Invoke-Api POST ($ApiRoot + '/integrations/outbound/whatsapp-text') $H $outB2
$ok100 = ($r100a.Status -eq 202) -and ($r100b.Status -eq 200)
try {
  $j100b = $r100b.Content | ConvertFrom-Json
  $ok100 = $ok100 -and ($j100b.duplicate -eq $true)
}
catch { $ok100 = $false }
Add-Row 'CT-100' 'Outbox idempotency_key duplicada' 'POST' ($ApiRoot + '/integrations/outbound/whatsapp-text') '202+200' $r100b.Status $outB2 $r100b.Content $(if ($ok100) { 'OK' } else { 'FALHA' }) 'CT-100: sem nova linha nem reenvio indevido'

$idemCt101 = "qa-ct101-$([guid]::NewGuid().ToString('N').Substring(0, 12))"
$r101 = Invoke-Api POST ($ApiRoot + '/integrations/outbound/whatsapp-text') $H (@{ customer_id = $script:customerId; text = 'ct101'; idempotency_key = $idemCt101 } | ConvertTo-Json -Compress)
Add-Row 'CT-101' 'Outbox enqueue preserva mensagem' 'POST' ($ApiRoot + '/integrations/outbound/whatsapp-text') '202' $r101.Status '{}' $r101.Content $(if ($r101.Status -eq 202) { 'OK' } else { 'FALHA' }) 'Falha de provider: OUTBOX_FORCE_SEND_FAILURE + vitest `outbox.integration`'

# BLOCO 10
$x = Invoke-Api GET "$BaseUrl/health" @{}
Add-Row 'CT-110' 'regressao health' 'GET' "$BaseUrl/health" '200' $x.Status '' $x.Content $(if ($x.Status -eq 200) { 'OK' } else { 'FALHA' })
$x = Invoke-Api GET "$BaseUrl/database/health" @{}
Add-Row 'CT-111' 'regressao db health' 'GET' "$BaseUrl/database/health" '200' $x.Status '' $x.Content $(if ($x.Status -eq 200) { 'OK' } else { 'FALHA' })
$x = Invoke-Api GET ($ApiRoot + '/services') $H
Add-Row 'CT-112' 'regressao GET services' 'GET' ($ApiRoot + '/services') '200' $x.Status '' $x.Content $(if ($x.Status -eq 200) { 'OK' } else { 'FALHA' })
$x = Invoke-Api GET ($ApiRoot + '/availability?professional_id=' + $script:professionalId + '&service_id=' + $script:serviceId + '&date=2026-12-15') $H
Add-Row 'CT-113' 'regressao availability' 'GET' ($ApiRoot + '/availability') '200' $x.Status '' $x.Content $(if ($x.Status -eq 200) { 'OK' } else { 'FALHA' })
$b114 = (@{
    customer_id = $script:customerId; professional_id = $script:professionalId; service_id = $script:serviceId
    starts_at = $slot114s; ends_at = $slot114e; idempotency_key = "qa-ct114-$([guid]::NewGuid().ToString('N').Substring(0, 12))"
    explicit_confirmation = $true; source = 'manual'
  } | ConvertTo-Json -Compress)
$x = Invoke-Api POST ($ApiRoot + '/appointments') $H $b114
Add-Row 'CT-114' 'regressao POST appointment' 'POST' ($ApiRoot + '/appointments') '201' $x.Status $b114 $x.Content $(if ($x.Status -eq 201) { 'OK' } else { 'FALHA' })

$b115 = (@{
    customer_id = $script:customerId; professional_id = $script:professionalId; service_id = $script:serviceId
    starts_at = $slot114s; ends_at = $slot114e; idempotency_key = "qa-ct115-dup-$([guid]::NewGuid().ToString('N').Substring(0, 12))"
    explicit_confirmation = $true; source = 'manual'
  } | ConvertTo-Json -Compress)
$r115 = Invoke-Api POST ($ApiRoot + '/appointments') $H $b115
Add-Row 'CT-115' 'slot CT-114 indisponivel (dup POST)' 'POST' ($ApiRoot + '/appointments') '409' $r115.Status $b115 $r115.Content $(if ($x.Status -eq 201 -and $r115.Status -eq 409) { 'OK' } elseif ($x.Status -ne 201) { 'FALHA (CT-114)' } else { 'FALHA' }) "Mesmo horario do CT-114; 409 conflito de slot"

$outCsv = Join-Path (Split-Path $PSScriptRoot -Parent) 'docs\QA_API_NEGATIVE_BATTERY_RESULTS.csv'
$rows | Export-Csv -Path $outCsv -NoTypeInformation -Encoding UTF8
Write-Host "CSV: $outCsv"
$rows | Format-Table CT, Verdict, Obtido, Cenario -AutoSize

$fail = @($rows | Where-Object { $_.Verdict -match 'FALHA|BUG' })
if ($fail.Count -gt 0) {
  Write-Host "Cenarios com FALHA/BUG: $($fail.Count)"
  exit 1
}
exit 0
