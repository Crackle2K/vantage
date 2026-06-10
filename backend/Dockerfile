FROM rust:1.87-slim-bookworm AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Build from the repository root so Cargo can resolve the workspace members
# (`backend` and `api`) exactly as CI and local development do.
COPY Cargo.toml Cargo.lock ./
COPY backend/Cargo.toml backend/Cargo.toml
COPY backend/rust-toolchain.toml backend/rust-toolchain.toml
COPY api/Cargo.toml api/Cargo.toml

COPY backend/src backend/src
COPY api/index.rs api/index.rs

RUN cargo build -p vantage-backend --bin vantage --release

FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/vantage /app/vantage
COPY backend/.env.example .env.example

EXPOSE 8000

ENV PORT=8000
ENV RUST_LOG=info

CMD ["./vantage"]
