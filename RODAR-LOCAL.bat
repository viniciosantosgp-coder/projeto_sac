@echo off
title SAC - rodando local
cd /d "%~dp0"

echo ============================================================
echo   SAC Grupo Presenca - versao LOCAL (para testes)
echo ============================================================
echo.
echo   ATENCAO: o banco de dados e o REAL (Firestore de producao).
echo   Criar, resolver ou reabrir chamado aqui grava de verdade.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado. Instale em https://nodejs.org e rode de novo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Primeira vez: instalando dependencias, pode levar 1-2 minutos...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [ERRO] Falha no npm install. Veja a mensagem acima.
    pause
    exit /b 1
  )
)

echo Subindo o sistema em http://localhost:4200
echo O navegador abre sozinho quando estiver pronto.
echo Para PARAR: feche esta janela (ou Ctrl+C).
echo.

call npx ng serve --open --port 4200

echo.
echo O servidor foi encerrado.
pause
