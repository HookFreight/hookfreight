# Hookfreight

Open-source webhook inbox and replay engine. Capture, store, forward, and replay webhooks with retries and full visibility.

## What it does

Hookfreight sits between webhook providers (Stripe, GitHub, Shopify, etc.) and your app:

1. Receives webhooks at a unique URL (`/{hook_token}`)
2. Stores the full request (headers, body, metadata)
3. Forwards to your destination (`forward_url`)
4. Retries automatically when delivery fails
5. Lets you inspect and replay any event

## Features

- Webhook capture (headers, body, query params, metadata)
- Reliable forwarding with automatic retries (queue-based)
- Replay any event on demand
- Delivery visibility (request/response, timing, errors, status)
- Multi-app organization (dev/staging/prod)
- Custom auth headers when forwarding
- Self-hosted

## Quick Start

### Prerequisites

- Docker + Docker Compose

### 1. Clone and configure

```bash
git clone https://github.com/YOUR_ORG/hookfreight.git
cd hookfreight
cp env.example .env
```

Edit `.env` as needed (the defaults work for local Docker).

### 2. Run

```bash
docker compose up --build
```

Hookfreight will be available at **http://localhost:3030**

> **Next steps:** See the [Quickstart Guide](https://docs.hookfreight.com/quickstart) for creating your first app and endpoint.

## Basic Usage

### Inbound URL

When you create an Endpoint, Hookfreight returns a `hook_token`. Point your webhook provider to:

```
http://<your-host>/{hook_token}
```

### Send a test webhook

```bash
curl -X POST http://localhost:3030/YOUR_HOOK_TOKEN \
  -H "Content-Type: application/json" \
  -d '{"event":"test","data":{"message":"Hello!"}}'
```

## Development

```bash
yarn install
yarn dev          # Start with hot reload
yarn build        # Compile TypeScript
yarn start        # Run production build
```

## Documentation

Full API reference and guides at **[docs.hookfreight.com](https://docs.hookfreight.com)**

- [Quickstart](https://docs.hookfreight.com/quickstart)
- [API Reference](https://docs.hookfreight.com/api-reference/introduction)

## License

Apache 2.0. See [LICENSE](LICENSE).
