#!/bin/bash

# 尝试加载环境变量，优先从.env文件加载
if [ -f ../.env ]; then
  echo "从../.env加载环境变量"
  export $(cat ../.env | grep -v '#' | awk '/=/ {print $1}')
elif [ -f ./.env ]; then
  echo "从./.env加载环境变量"
  export $(cat ./.env | grep -v '#' | awk '/=/ {print $1}')
elif [ -f ./config.json ]; then
  echo "从config.json加载环境变量"
  # 使用jq工具解析JSON并设置环境变量（如果Docker容器中有jq）
  if command -v jq &> /dev/null; then
    while IFS="=" read -r key value; do
      export "$key"="$value"
    done < <(jq -r 'to_entries | map("\(.key)=\(.value)") | .[]' ./config.json)
  else
    echo "警告: 没有安装jq工具，无法解析config.json"
  fi
else
  echo "警告: 找不到.env或config.json文件，将使用默认环境变量"
fi

# 创建初始管理员账户
echo "检查并创建管理员账户..."
node scripts/createAdmin.js

# 根据环境变量选择启动模式
if [ "$NODE_ENV" = "production" ]; then
  echo "以生产模式启动服务器..."
  npm run start
elif [ "$STABLE_MODE" = "true" ]; then
  echo "以稳定开发模式启动服务器..."
  npm run dev:stable
else
  echo "以开发模式启动服务器..."
  npm run dev
fi 