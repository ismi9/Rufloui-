FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production=false

COPY . .

RUN npm run build

EXPOSE ${PORT:-28580}

CMD ["npx", "tsx", "src/backend/server.ts"]
