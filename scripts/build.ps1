# Compila com ferramentas isoladas nesta pasta, sem instalação global.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolPython = Join-Path $projectRoot '.tools/platformio/Scripts/python.exe'
$localConfig = Join-Path $projectRoot 'firmware/lixeira_iot/config.h'
$previousCoreDir = $env:PLATFORMIO_CORE_DIR

Push-Location $projectRoot
try {
    if (-not (Test-Path -LiteralPath $localConfig)) {
        Copy-Item -LiteralPath 'firmware/lixeira_iot/config.example.h' -Destination $localConfig
        Write-Host 'config.h criado com os valores publicos do Wokwi. Revise antes de usar em hardware.'
    }

    if (-not (Test-Path -LiteralPath $toolPython)) {
        & python -m venv '.tools/platformio'
        if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar o ambiente Python. Instale Python 3 e confira o PATH.' }
    }

    & $toolPython -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('platformio') else 1)"
    if ($LASTEXITCODE -ne 0) {
        & $toolPython -m pip install 'platformio==6.1.18'
        if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar PlatformIO. Confira a conexao com a internet.' }
    }

    $env:PLATFORMIO_CORE_DIR = Join-Path $projectRoot '.tools/pio-core'
    & $toolPython -m platformio run -e esp32dev
    if ($LASTEXITCODE -ne 0) { throw 'A compilacao falhou. Consulte os erros acima.' }
}
finally {
    $env:PLATFORMIO_CORE_DIR = $previousCoreDir
    Pop-Location
}
