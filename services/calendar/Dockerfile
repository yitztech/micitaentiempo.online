# syntax=docker/dockerfile:1
# Imagen del motor de calendario. Se construye desde la raíz del repositorio:
#   docker build -f services/calendar/Dockerfile --build-arg RELEASE_SHA=<sha> .
FROM golang:1.27.1-alpine3.24 AS build
WORKDIR /src
COPY services/calendar/go.mod services/calendar/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY services/calendar/ ./
ARG RELEASE_SHA=dev
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.revision=${RELEASE_SHA}" \
    -o /out/calendar ./cmd/calendar

FROM gcr.io/distroless/static-debian13:nonroot
COPY --from=build /out/calendar /calendar
EXPOSE 8080 8081
ENTRYPOINT ["/calendar"]
CMD ["serve"]
