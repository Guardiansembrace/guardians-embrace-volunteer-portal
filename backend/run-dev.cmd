@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "PYTHON_EXE=%SCRIPT_DIR%..\.venv\Scripts\python.exe"

if not exist "%PYTHON_EXE%" (
  echo Repo virtual environment not found at "%PYTHON_EXE%".
  echo Create it first from the repo root:
  echo   py -m venv .venv
  echo   .venv\Scripts\python.exe -m pip install -r backend\requirements.txt
  exit /b 1
)

pushd "%SCRIPT_DIR%"
"%PYTHON_EXE%" -m uvicorn app.main:app --host 127.0.0.1 --port 8081
set "EXIT_CODE=%ERRORLEVEL%"
popd

exit /b %EXIT_CODE%
