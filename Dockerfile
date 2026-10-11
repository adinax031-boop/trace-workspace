FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 TRACE_DB=/app/data/trace.db
WORKDIR /app
COPY --chown=node:node package.json server.js restore.js ./
COPY --chown=node:node public ./public
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
