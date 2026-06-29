FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund

COPY --from=build /app/dist ./dist
COPY --from=build /app/server-dist ./server-dist

EXPOSE 3000
CMD ["node", "server-dist/index.js"]
