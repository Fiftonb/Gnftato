FROM node:20-alpine

WORKDIR /app

# 设置默认环境变量
ENV NODE_ENV=development
ENV PORT=3001
ENV JWT_SECRET=default_secret_please_change
ENV CORS_ORIGIN=*

# 复制package.json文件
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# 安装依赖
RUN npm install
RUN cd server && npm install --production=false
RUN cd client && npm install

# 复制应用程序代码
COPY . .

# 构建前端
RUN npm run build

# 给启动脚本添加执行权限
RUN chmod +x /app/server/start.sh
# 确保文件使用Unix格式的换行符
RUN if [ -f /app/server/start.sh ]; then \
      sed -i 's/\r$//' /app/server/start.sh; \
      echo "start.sh文件存在并已修复换行符"; \
    else \
      echo "start.sh文件不存在！"; \
      exit 1; \
    fi

# 暴露端口
EXPOSE 3001

# 设置工作目录
WORKDIR /app/server

# 安装jq工具以支持config.json解析
RUN apk add --no-cache jq

# 启动命令（使用绝对路径）
CMD ["/bin/sh", "/app/server/start.sh"] 