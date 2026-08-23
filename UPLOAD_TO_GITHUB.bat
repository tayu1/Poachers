@echo off
echo ========================================================
echo Uploading Poachers v3 to GitHub...
echo ========================================================
echo.
git init
git remote add origin https://github.com/tayu1/Poachers.git
git branch -M main
git add .
git commit -m "Force overwrite with Poachers v3"
git push origin main -f
echo.
echo ========================================================
echo If you saw a login popup, please sign in.
echo Upload complete! You can now check Render.
echo ========================================================
pause
