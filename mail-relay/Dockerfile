FROM oven/bun:1.3.11-alpine
RUN apk add --no-cache openssh-client ca-certificates
WORKDIR /app
COPY health.ts /app/health.ts
USER 1000:1000
HEALTHCHECK --interval=30s --timeout=3s --start-period=45s --retries=3 CMD bun -e "const r=await fetch('http://127.0.0.1:8080/health',{signal:AbortSignal.timeout(2000)});if(!r.ok)process.exit(1)"
CMD ["bun", "/app/health.ts"]
