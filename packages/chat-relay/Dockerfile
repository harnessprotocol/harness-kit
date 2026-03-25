FROM node:22-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY dist/ ./dist/
EXPOSE 4801
CMD ["node", "dist/index.js"]
