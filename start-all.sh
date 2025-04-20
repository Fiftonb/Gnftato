#!/bin/bash

# 显示启动信息
echo "正在启动 Gnftato 应用..."

# 启动后端（稳定模式）
echo "启动后端服务器..."
cd server
./start.sh &
BACKEND_PID=$!
cd ..

# 等待后端启动
sleep 2

# 检查前端目录
if [ -d "client" ]; then
  echo "启动前端应用..."
  cd client
  npm run serve &
  FRONTEND_PID=$!
  cd ..
else
  echo "错误: 找不到前端目录!"
  kill $BACKEND_PID
  exit 1
fi

echo "应用启动完成!"
echo "前端运行在: http://localhost:8080"
echo "后端运行在: http://localhost:3001"
echo "按 Ctrl+C 停止所有服务"

# 等待用户中断
wait

# 确保子进程被终止
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT 