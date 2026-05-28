# Funções partilhadas pelas baterias QA (PowerShell 5.1+).
# Uso: . "$PSScriptRoot\lib\qa-api-helpers.ps1"

function Get-DotEnvValue {
  param(
    [string] $RepoRoot,
    [string] $Key,
    [string] $Default
  )
  $fromEnv = [Environment]::GetEnvironmentVariable($Key)
  if ($fromEnv) { return $fromEnv }
  $envFile = Join-Path $RepoRoot '.env'
  if (Test-Path -LiteralPath $envFile) {
    foreach ($line in Get-Content -LiteralPath $envFile) {
      if ($line -match "^\s*$([regex]::Escape($Key))\s*=\s*(.+)\s*$") {
        return $Matches[1].Trim().Trim('"').Trim("'")
      }
    }
  }
  return $Default
}

function Escape-Csv([string] $s) {
  if ($null -eq $s) { return '""' }
  $t = $s -replace "`r`n", ' ' -replace "`n", ' ' -replace '"', '""'
  if ($t.Length -gt 8000) { $t = $t.Substring(0, 8000) + '…' }
  return "`"$t`""
}

function Invoke-ApiRaw {
  param(
    [string] $Method,
    [string] $Url,
    [hashtable] $Headers = @{},
    [string] $JsonBody = $null
  )
  $params = @{
    Uri             = $Url
    Method          = $Method
    UseBasicParsing = $true
  }
  if ($Headers.Count -gt 0) {
    $params.Headers = [hashtable]::new($Headers)
  }
  $verb = $Method.ToUpperInvariant()
  $canHaveBody = $verb -in @('POST', 'PUT', 'PATCH', 'DELETE')
  if ($canHaveBody -and ($null -ne $JsonBody) -and ($JsonBody -ne '')) {
    $params.ContentType = 'application/json'
    $params.Body        = $JsonBody
  }
  if ($PSVersionTable.PSVersion.Major -ge 6) {
    $params.SkipHttpErrorCheck = $true
    $resp = Invoke-WebRequest @params
    return @{ Code = [int]$resp.StatusCode; Body = $resp.Content }
  }
  try {
    $resp = Invoke-WebRequest @params -ErrorAction Stop
    return @{ Code = [int]$resp.StatusCode; Body = $resp.Content }
  }
  catch {
    $ex = $_.Exception
    if ($ex.Response) {
      $code = [int]$ex.Response.StatusCode
      $stream = $ex.Response.GetResponseStream()
      if ($null -ne $stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        $text = $reader.ReadToEnd()
        return @{ Code = $code; Body = $text }
      }
      return @{ Code = $code; Body = $ex.Message }
    }
    throw
  }
}

function Login-Token {
  param(
    [string] $ApiBase,
    [string] $Email,
    [string] $Password
  )
  $j = (@{ email = $Email; password = $Password } | ConvertTo-Json -Compress)
  $maxAttempts = 5
  $delaySec = 65
  for ($a = 1; $a -le $maxAttempts; $a++) {
    $r = Invoke-ApiRaw -Method Post -Url "$ApiBase/auth/login" -JsonBody $j
    if ($r.Code -eq 200) {
      $o = $r.Body | ConvertFrom-Json
      return [string]$o.access_token
    }
    if ($r.Code -eq 429 -and $a -lt $maxAttempts) {
      Write-Host "Login rate limit ($Email); pausa ${delaySec}s ($a/$maxAttempts)..." -ForegroundColor DarkYellow
      Start-Sleep -Seconds $delaySec
      continue
    }
    throw "Login falhou ($Email): HTTP $($r.Code) $($r.Body)"
  }
  throw "Login falhou ($Email): tentativas esgotadas"
}

function New-QaAuthHeaders {
  param(
    [string] $Token,
    [string] $TenantId
  )
  return @{
    Authorization = "Bearer $Token"
    'x-tenant-id' = $TenantId
  }
}

function Get-AvailabilitySlots {
  param(
    [string] $ApiBase,
    [hashtable] $AuthHeaders,
    [string] $ProfessionalId,
    [string] $ServiceId,
    [string] $DateStr
  )
  $url = "$ApiBase/api/v1/availability?professional_id=$ProfessionalId&service_id=$ServiceId&date=$DateStr&min_advance_minutes=0&max_slots=50"
  $r = Invoke-ApiRaw -Method Get -Url $url -Headers $AuthHeaders
  if ($r.Code -ne 200) { throw "Availability falhou: HTTP $($r.Code) $($r.Body)" }
  return @(($r.Body | ConvertFrom-Json).slots)
}

function Next-WeekdayDate([int] $MinDaysAhead) {
  $d = [DateTime]::UtcNow.Date.AddDays($MinDaysAhead)
  while ($d.DayOfWeek -eq [DayOfWeek]::Sunday) {
    $d = $d.AddDays(1)
  }
  return $d.ToString('yyyy-MM-dd')
}

function Find-AvailabilityDateWithSlots {
  param(
    [string] $ApiBase,
    [hashtable] $AuthHeaders,
    [string] $ProfessionalId,
    [string] $ServiceId,
    [int] $MinSlots = 1,
    [int] $StartDaysAhead = 7
  )
  for ($i = $StartDaysAhead; $i -le 120; $i += 3) {
    $tryDate = Next-WeekdayDate $i
    $slots = Get-AvailabilitySlots -ApiBase $ApiBase -AuthHeaders $AuthHeaders `
      -ProfessionalId $ProfessionalId -ServiceId $ServiceId -DateStr $tryDate
    if ($slots.Count -ge $MinSlots) {
      return @{ Date = $tryDate; Slots = $slots }
    }
  }
  throw 'Não foi possível obter slots de availability (verifique business_hours / seed 099).'
}

function Write-QaCaseResult {
  param(
    [System.Collections.Generic.List[hashtable]] $Cases,
    [string] $Id,
    [string] $Area,
    [string[]] $Steps,
    [string] $Expected,
    [int] $ExpectedHttp,
    [int] $ActualHttp,
    [string] $ActualDetail = '',
    [string] $Evidence = ''
  )
  $ok = ($ExpectedHttp -eq $ActualHttp)
  $status = if ($ok) { 'OK' } else { 'FAIL' }
  $Cases.Add(@{
      id       = $Id
      area     = $Area
      steps    = $Steps
      expected = $Expected
      actual   = if ($ActualDetail) { "HTTP $ActualHttp $ActualDetail" } else { "HTTP $ActualHttp" }
      status   = $status
      evidence = $Evidence
      defect   = if ($ok) { '' } else { "Esperado HTTP $ExpectedHttp, obtido $ActualHttp" }
    })
  return $ok
}

function Save-QaResultsJson {
  param(
    [string] $OutPath,
    [System.Collections.Generic.List[hashtable]] $Cases,
    [hashtable] $Meta
  )
  $ok = @($Cases | Where-Object { $_.status -eq 'OK' }).Count
  $fail = @($Cases | Where-Object { $_.status -eq 'FAIL' }).Count
  $payload = @{
    executed_at = (Get-Date).ToUniversalTime().ToString('o')
    totals      = @{
      OK   = $ok
      FAIL = $fail
      N_A  = 0
    }
  }
  foreach ($k in $Meta.Keys) { $payload[$k] = $Meta[$k] }
  $payload.cases = @($Cases)
  $json = $payload | ConvertTo-Json -Depth 8
  $dir = Split-Path -Parent $OutPath
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  [System.IO.File]::WriteAllText($OutPath, $json, [System.Text.UTF8Encoding]::new($false))
  return @{ Ok = $ok; Fail = $fail; Path = $OutPath }
}
