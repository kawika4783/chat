FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY services/api ./services/api
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node services/api/server.mjs"]
