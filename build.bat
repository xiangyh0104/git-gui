@echo off
cd /d "%~dp0"
echo Building git-gui...
call npx tauri build
if %errorlevel% equ 0 (
    echo.
    echo Build successful! Output: src-tauri\target\release\git-gui.exe
    explorer /select,"src-tauri\target\release\git-gui.exe"
) else (
    echo.
    echo Build failed!
)
pause
