FROM node:22-alpine

WORKDIR /app

COPY package.json tsconfig.json next.config.ts next-env.d.ts ./
RUN npm install

COPY src ./src

EXPOSE 3000

CMD ["npm", "run", "dev"]
