FROM node:20-alpine

WORKDIR /app

# 复制package.json文件
COPY package*.json ./
COPY server/package*.json ./server/

# 安装依赖
RUN npm install
RUN cd server && npm install

# 复制配置文件
COPY server/config.json ./server/

# 复制应用程序代码
COPY . .

# 暴露端口
EXPOSE 3001

# 设置工作目录
WORKDIR /app/server

# 安装jq工具以支持config.json解析
RUN apk add --no-cache jq

# 启动命令
CMD ["./start.sh"] 