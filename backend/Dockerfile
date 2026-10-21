FROM node:20-alpine

WORKDIR /app

# 依赖先装，利用层缓存
COPY package*.json ./
RUN npm install --omit=dev

# 拷贝源码
COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
