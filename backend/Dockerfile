FROM node:18-bullseye-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-bullseye-slim AS prod
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY src/ ./src/
COPY prisma/ ./prisma/
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh && ./node_modules/.bin/prisma generate
ENV NODE_ENV=production
EXPOSE 4000
ENTRYPOINT ["./entrypoint.sh"]
