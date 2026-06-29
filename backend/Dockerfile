# Skylark backend — Bun + Hono + Sequelize
FROM oven/bun:1.1-debian AS base
WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json ./
RUN bun install

# App source.
COPY . .
RUN chmod +x docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD bun -e "fetch('http://localhost:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
