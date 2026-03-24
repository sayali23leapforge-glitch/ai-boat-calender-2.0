#!/usr/bin/env pwsh
$ErrorActionPreference = 'Continue'

Write-Host "=== GIT STATUS ===" -ForegroundColor Green
git status

Write-Host "`n=== GIT LOG (Last 10 Commits) ===" -ForegroundColor Green
git log --oneline -10

Write-Host "`n=== GIT REMOTE ===" -ForegroundColor Green
git remote -v

Write-Host "`n=== GIT BRANCH (Tracking) ===" -ForegroundColor Green
git branch -vv

Write-Host "`n=== DONE ===" -ForegroundColor Green
