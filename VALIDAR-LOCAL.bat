@echo off
title SAC + OUVIDORIA - VALIDACAO LOCAL (banco de teste)
cd /d "%~dp0"

echo ============================================================
echo   SAC + OUVIDORIA - VALIDACAO LOCAL
echo ============================================================
echo.
echo   Banco: sac-ouvidoria-teste (TESTE), com dados FICTICIOS.
echo   Nada do que voce fizer aqui vai para a producao (sac-presenca).
echo   O login e o mesmo da Presenca.
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

echo Preparando os dados ficticios no banco de teste...
call node validacao-local\semear-dados-teste.mjs
if errorlevel 1 (
  echo [AVISO] Nao foi possivel preparar os dados ficticios. O sistema sobe assim mesmo.
)
echo.
echo O que validar: veja validacao-local\ROTEIRO.md
echo.
echo Subindo o sistema em http://localhost:4300 (faixa amarela "MODO LOCAL" no topo)
echo O navegador abre sozinho quando estiver pronto.
echo Para PARAR: feche esta janela (ou Ctrl+C).
echo.

call npx ng serve --configuration local --open --port 4300

echo.
echo O servidor foi encerrado.
pause
