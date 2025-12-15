#!/bin/bash

# 确保环境变量包含 npm 所在路径
export PATH=$PATH:/usr/local/bin

# 切换到项目目录
SOURCE_DIR="/Users/sakuraity/Documents/Vibe Creating/myblog-antigravatity"

if [ ! -d "$SOURCE_DIR" ]; then
    echo "❌ 错误：找不到项目目录 '$SOURCE_DIR'"
    read -n 1 -s -r -p "按任意键退出..."
    exit 1
fi

cd "$SOURCE_DIR"

echo "========================================"
echo "🚀 开始导入剪贴板内容到博客..."
echo "========================================"

# 执行 npm 命令，使用绝对路径确保安全
# 如果失败，打印错误信息并等待
/usr/local/bin/npm run import:paste

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 成功！文章已生成。"
    echo "按任意键关闭窗口..."
    read -n 1 -s -r
else
    echo ""
    echo "❌ 失败：导入过程中发生错误。"
    echo "请检查上方报错信息。"
    echo "按任意键关闭窗口..."
    read -n 1 -s -r
fi
