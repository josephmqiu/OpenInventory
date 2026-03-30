Set-Location "D:\InventoryMonitor"
$env:PATH = "$env:USERPROFILE\.cargo\bin;" + $env:PATH
npm.cmd exec tauri dev *>> "D:\InventoryMonitor\tauri-dev.log"
