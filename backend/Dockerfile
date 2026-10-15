FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY scripts ./scripts
RUN mkdir -p /app/uploads/private && chown -R node:node /app
USER node
EXPOSE 5000
CMD ["node", "src/index.js"]
