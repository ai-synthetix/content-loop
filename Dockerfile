FROM golang:1.22-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/content-loop ./cmd/api

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=builder /out/content-loop /usr/local/bin/content-loop
COPY migrations /migrations
EXPOSE 8080
ENTRYPOINT ["content-loop"]
