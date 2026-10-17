@echo off
chcp 65001 >nul
title Движок разбора звонков
cd /d "%~dp0"

echo.
echo   ====================================================
echo    РАЗБОР ЗВОНКА
echo   ====================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [!] На компьютере нет Node.js — без него программа не запустится.
  echo.
  echo   Скачайте версию LTS с nodejs.org, установите, закройте это окно
  echo   и запустите start.bat снова.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo   Первый запуск: доустанавливаю нужные библиотеки.
  echo   Это бывает только один раз, займёт пару минут.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   [!] Установка не прошла. Покажите текст выше — разберёмся.
    pause
    exit /b 1
  )
  echo.
)

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo   Создан файл .env — в него нужно вписать ключи.
  echo   Сейчас он откроется в Блокноте.
  echo.
  echo   Впишите три значения после знака = и сохраните Ctrl+S:
  echo     YANDEX_FOLDER_ID   идентификатор каталога, начинается на b1g
  echo     YANDEX_STT_KEY     ключ с областью speechkitStt
  echo     YANDEX_GPT_KEY     ключ с областью languageModels
  echo.
  notepad .env
  echo.
)

set "FILE=%~1"
if "%FILE%"=="" (
  echo   Перетащите файл записи прямо на start.bat — и он разберётся.
  echo.
  set /p FILE="  Или впишите путь к записи сюда: "
)

if "%FILE%"=="" (
  echo.
  echo   Файл не выбран. Запустите снова.
  pause
  exit /b 1
)

echo.
call npm run analyze -- "%FILE%"

echo.
echo   ====================================================
echo    Готовый отчёт лежит в папке out — откройте его браузером.
echo   ====================================================
echo.
pause
