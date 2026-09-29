FROM python:3.12

RUN apt-get update && apt-get install -y nodejs npm

WORKDIR /app

COPY . .

RUN npm install

EXPOSE 3000

CMD ["npm","start"]
