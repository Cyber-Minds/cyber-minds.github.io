# Sandbox image for the browser terminal: Node/npm, Go, and a JDK in one box.
FROM golang:1.24-bookworm AS go

FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      openjdk-17-jdk-headless git curl ca-certificates build-essential python3 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=go /usr/local/go /usr/local/go

ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
    GOROOT=/usr/local/go \
    PATH=/usr/local/go/bin:/usr/lib/jvm/java-17-openjdk-amd64/bin:$PATH

# Faster JVM startup for short javac/java runs.
ENV JAVA_TOOL_OPTIONS="-XX:TieredStopAtLevel=1 -XX:+UseSerialGC -Xshare:auto"

COPY container/server.cjs /opt/runtime/server.cjs

# Run as the unprivileged `node` user (uid 1000) with a writable /workspace.
RUN mkdir -p /workspace && chown node:node /workspace
USER node
# Pre-compile the Go standard library into the build cache the server uses, so
# the first `go run` does not rebuild fmt, os, net/http and friends.
RUN GOCACHE=/tmp/go-cache GOFLAGS=-buildvcs=false GOTOOLCHAIN=local go build std
WORKDIR /workspace
EXPOSE 8080
CMD ["node", "/opt/runtime/server.cjs"]
