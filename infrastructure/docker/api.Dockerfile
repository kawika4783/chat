FROM node:22-alpine
WORKDIR /app
COPY infrastructure/mock-api/server.mjs ./server.mjs
EXPOSE 3001
CMD ["node", "server.mjs"]
