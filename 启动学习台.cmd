@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 启动后请打开 http://127.0.0.1:4173
echo 关闭此窗口即可停止服务。
node server.mjs
pause
