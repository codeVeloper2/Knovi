# Quick backend diagnostic script
Write-Host "Testing PeerUP Backend Connection..." -ForegroundColor Cyan
Write-Host ""

$baseUrl = "http://127.0.0.1:8000"

# Test 1: Health check
Write-Host "[1] Testing basic connectivity..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/docs" -Method GET -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    Write-Host "   ✓ Backend is running (HTTP $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Backend not responding: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Make sure you've started the backend with:" -ForegroundColor Yellow
    Write-Host "   cd backend" -ForegroundColor White
    Write-Host "   python run.py" -ForegroundColor White
    exit 1
}

# Test 2: Check if chat routes are registered
Write-Host "[2] Checking if chat routes are registered..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/openapi.json" -Method GET -UseBasicParsing -ErrorAction Stop
    $openapi = $response.Content | ConvertFrom-Json
    $chatPaths = $openapi.paths.PSObject.Properties.Name | Where-Object { $_ -like "*/chat/*" }
    
    if ($chatPaths.Count -gt 0) {
        Write-Host "   ✓ Found $($chatPaths.Count) chat endpoints" -ForegroundColor Green
    } else {
        Write-Host "   ✗ No chat endpoints found!" -ForegroundColor Red
        Write-Host "   The chat router may not be registered in main.py" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ✗ Could not fetch OpenAPI spec: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Test WebSocket endpoint (basic check)
Write-Host "[3] Checking WebSocket endpoint..." -ForegroundColor Yellow
$wsTestUrl = "$baseUrl/api/chat/ws/1?token=test"
Write-Host "   WebSocket URL would be: ws://127.0.0.1:8000/api/chat/ws/{conv_id}?token={jwt}" -ForegroundColor Gray

Write-Host ""
Write-Host "Diagnostic complete!" -ForegroundColor Cyan
Write-Host ""
Write-Host "If the backend is running but chat fails, check the backend console for errors." -ForegroundColor Yellow
