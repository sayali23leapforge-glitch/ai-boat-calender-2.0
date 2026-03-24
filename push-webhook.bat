@echo off
cd /d "c:\Users\sayal\Desktop\Calenderapp 10\Calenderapp 10"
git add app/api/webhooks/bloo/route.ts
git commit -m "fix: rewrite webhook - match by bloo_bound_number, reply always, fix user lookup"
git push origin main
echo EXIT_CODE=%ERRORLEVEL%
