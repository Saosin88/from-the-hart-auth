FROM node:22-alpine AS builder
WORKDIR /usr/app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app

ARG FIREBASE_PROJECT_ID
ARG FIREBASE_WEB_API_KEY
ARG FIREBASE_AUTH_DOMAIN
ARG NODE_ENV=production
ARG LOG_LEVEL=info

ENV FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID
ENV FIREBASE_WEB_API_KEY=$FIREBASE_WEB_API_KEY
ENV FIREBASE_AUTH_DOMAIN=$FIREBASE_AUTH_DOMAIN
ENV NODE_ENV=$NODE_ENV
ENV LOG_LEVEL=$LOG_LEVEL
ENV PORT=8080
ENV HOST=0.0.0.0

COPY --from=builder /usr/app/dist/. ./
COPY --from=builder /usr/app/node_modules ./node_modules
COPY --from=builder /usr/app/src/public ./public
EXPOSE 8080
CMD ["node", "server.js"]