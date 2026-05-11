FROM node:24-alpine

WORKDIR /app

RUN npm install -g pnpm@11.0.9

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm dashboard:web:build

EXPOSE 5173

CMD ["pnpm", "start"]
