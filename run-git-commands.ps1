git status | Out-File ./git-status-result.txt
git log --oneline -10 | Out-File ./git-log-result.txt
git remote -v | Out-File ./git-remote-result.txt
git branch -vv | Out-File ./git-branch-result.txt
Write-Host "Git commands executed and saved"
