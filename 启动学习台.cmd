@echo off
setlocal
chcp 65001 >nul
pushd "%~dp0"
if errorlevel 1 goto :folder_error
where node >nul 2>nul
if errorlevel 1 goto :node_error
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)"
if errorlevel 1 goto :version_error
node launcher.mjs %*
if errorlevel 1 pause
popd
exit /b
:node_error
echo 未找到 Node.js，请先安装并配置 PATH，再重新启动。
goto :failed
:version_error
echo 需要 Node.js 22 或以上版本，请更新后重试。
goto :failed
:folder_error
echo 无法进入项目目录，请先将压缩包完整解压到可写文件夹。
pause
exit /b 1
:failed
pause
popd
exit /b 1
