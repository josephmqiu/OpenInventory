@echo off
cd /d D:\InventoryMonitor
call "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat"
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
npm.cmd exec tauri dev >> "D:\InventoryMonitor\tauri-dev.log" 2>&1
