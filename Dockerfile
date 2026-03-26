FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache fontconfig ttf-dejavu

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build


FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache fontconfig ttf-dejavu

COPY package*.json ./

RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

RUN addgroup app && adduser -S -G app app

USER app

EXPOSE 3000

CMD ["node", "dist/main.js"]
