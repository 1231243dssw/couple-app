# 仓库根目录构建（Railway 直接从根构建，无需 rootDirectory）
FROM node:20-alpine

WORKDIR /app

# 依赖先装，利用层缓存
COPY backend/package*.json ./
RUN npm install --omit=dev

# 拷贝后端源码
COPY backend/ ./

# PORT 由 Railway 运行时注入
EXPOSE 3000

CMD ["node", "server.js"]
