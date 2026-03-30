@echo off
cd /d D:\InventoryMonitor\src-tauri
call "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat"
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
cargo run --release --no-default-features --color always -- >> "D:\InventoryMonitor\cargo-run-release.log" 2>&1
