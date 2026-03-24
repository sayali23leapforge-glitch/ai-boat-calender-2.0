@echo off
cd /d "c:\Users\sayal\Desktop\Calenderapp 10\Calenderapp 10"
echo === Git Status ===
git status
echo.
echo === Staging files ===
git add server.js package.json error-handler.js
git add -A
echo.
echo === Committing ===
git commit -m "add custom server with error handler to prevent ELIFECYCLE crashes"
echo.
echo === Pushing to origin main ===
git push origin main
echo.
echo === Final log ===
git log --oneline -5
echo.
echo === Done ===
pause
