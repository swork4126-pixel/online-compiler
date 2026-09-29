FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    nodejs \
    npm \
    php-cli \
    openjdk-21-jdk \
    g++ \
    gcc \
    golang \
    rustc \
    cargo \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN npm install

EXPOSE 3000

CMD ["npm", "start"]
