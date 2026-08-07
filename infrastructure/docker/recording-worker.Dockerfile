FROM node:22-alpine
WORKDIR /app
COPY infrastructure/mock-api/recorder.mjs ./recorder.mjs
EXPOSE 3002
CMD ["node", "recorder.mjs"]
