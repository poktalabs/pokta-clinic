# Build context is the repo root (Render: rootDir unset, dockerfilePath apps/mock-ehr/Dockerfile),
# because the image needs the shared packages/fhir workspace package.
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/fhir/package.json packages/fhir/
COPY apps/mock-ehr/package.json apps/mock-ehr/
RUN pnpm install --frozen-lockfile --filter @pokta-clinic/mock-ehr...
COPY packages/fhir packages/fhir
COPY apps/mock-ehr apps/mock-ehr
RUN pnpm --filter @pokta-clinic/mock-ehr build \
 && pnpm --filter @pokta-clinic/mock-ehr deploy --prod --legacy /out

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./
COPY --from=build /repo/apps/mock-ehr/dist ./dist
# Migrations run on boot (src/db/bootstrap.ts).
COPY --from=build /repo/apps/mock-ehr/drizzle ./drizzle
USER node
EXPOSE 8787
CMD ["node", "dist/server.js"]
