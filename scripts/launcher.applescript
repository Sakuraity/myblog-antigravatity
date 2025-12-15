tell application "Terminal"
    activate
    do script "cd '/Users/sakuraity/Documents/Vibe Creating/myblog-antigravatity' && export PATH=$PATH:/usr/local/bin && npm run import:paste; echo ''; echo '按任意键关闭窗口...'; read -n 1;"
end tell
