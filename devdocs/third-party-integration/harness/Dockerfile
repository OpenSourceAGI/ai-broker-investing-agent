FROM node:22-bookworm-slim AS node
FROM oven/bun:1.3.11
# Vitest forks and coverage need Node, not Bun's node fallback. Native install
# scripts also require Python and a compiler; these are assessment prerequisites.
COPY --from=node /usr/local/bin/node /usr/local/bin/node
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ git ca-certificates curl && rm -rf /var/lib/apt/lists/*
