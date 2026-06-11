<#
  test-webhook.ps1 - Simulate a Lipila (Standard Webhooks) callback so you can
  verify /api/payments/webhook WITHOUT making a real payment.

  It signs a payload exactly the way Lipila does - HMAC-SHA256 over
  "{webhook-id}.{webhook-timestamp}.{body}", keyed by the base64-DECODED signing
  secret, base64 digest, "v1," prefix - and POSTs it with the matching
  webhook-id / webhook-timestamp / webhook-signature headers.

  The definitive signal is in the Vercel logs: look for `signature check: match`.
  (HTTP status is secondary: in strict mode a valid sig is 200 and a tampered
  one is 401; while LIPILA_WEBHOOK_ALLOW_UNSIGNED=true everything returns 200 and
  the log line is what tells you whether the signature verified.)

  Examples
  --------
  # Signature test against prod (fake reference -> no DB side effects):
  $env:LIPILA_WEBHOOK_SECRET = '<your base64 dashboard secret>'
  ./scripts/test-webhook.ps1

  # Negative test - tamper the signature (expect HTTP 401 in strict mode):
  ./scripts/test-webhook.ps1 -Tamper

  # Full activation test - use a REAL pending payment's reference:
  ./scripts/test-webhook.ps1 -Reference <pending-ref>

  # Just print what would be sent, don't POST:
  ./scripts/test-webhook.ps1 -DryRun
#>
param(
  [string]$Secret    = $env:LIPILA_WEBHOOK_SECRET,
  [string]$Url       = 'https://www.lengamaps.com/api/payments/webhook',
  [string]$Reference = 'test-no-such-ref-0001',
  [ValidateSet('successful','failed')][string]$Status = 'successful',
  [switch]$Tamper,
  [switch]$DryRun
)

if (-not $Secret) {
  throw 'No secret. Pass -Secret or set $env:LIPILA_WEBHOOK_SECRET to the base64 dashboard secret.'
}

$webhookId = [guid]::NewGuid().ToString()
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$type      = if ($Status -eq 'successful') { 'transaction.completed' } else { 'transaction.failed' }

# Compact JSON; the exact bytes we sign are the exact bytes we send.
$body = @{
  type = $type
  data = @{
    referenceId = $Reference
    identifier  = 'LPLXC-TEST-0001'
    status      = $Status
    paymentType = 'Card'
    amount      = 1
    currency    = 'ZMW'
  }
} | ConvertTo-Json -Compress -Depth 5

# Sign exactly as src/app/api/payments/webhook/route.ts verifies.
$signedContent = "$webhookId.$timestamp.$body"
$key  = [Convert]::FromBase64String(($Secret -replace '^whsec_', ''))
$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = $key
$digest = [Convert]::ToBase64String($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($signedContent)))
$signature = if ($Tamper) { 'v1,' + [Convert]::ToBase64String((New-Object byte[] 32)) } else { "v1,$digest" }

Write-Host "POST $Url"
Write-Host "  webhook-id:        $webhookId"
Write-Host "  webhook-timestamp: $timestamp"
Write-Host "  webhook-signature: $signature"
Write-Host "  body:              $body"
if ($Tamper) { Write-Host '  (signature deliberately invalid - expect rejection in strict mode)' -ForegroundColor Yellow }

if ($DryRun) { return }

$headers = @{
  'webhook-id'        = $webhookId
  'webhook-timestamp' = "$timestamp"
  'webhook-signature' = $signature
}
try {
  $resp = Invoke-WebRequest -Uri $Url -Method Post -Headers $headers -Body $body -ContentType 'application/json' -UseBasicParsing
  Write-Host "-> HTTP $([int]$resp.StatusCode): $($resp.Content)" -ForegroundColor Green
} catch {
  $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { '???' }
  Write-Host "-> HTTP $code (rejected): $($_.Exception.Message)" -ForegroundColor Yellow
}
