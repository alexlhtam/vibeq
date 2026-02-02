FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# We use dev mode for now to keep it lightweight and editable
CMD ["npm", "run", "dev"]