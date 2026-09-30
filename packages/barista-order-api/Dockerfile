FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production --silent || true
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
