# EmergencyLink Production MVP

This is a deployable full-stack MVP for the project:
**A Cloud-Connected Emergency Communication System for Network-Blackout Areas Using Offline-First Mesh Networking.**

## Included
- JWT authentication and password hashing
- SQLite persistent cloud database
- Emergency-report REST API
- Offline queue and automatic synchronization
- PWA/service-worker offline shell
- WebSocket peer signaling foundation
- WebRTC-ready peer transport architecture
- Admin role
- Docker deployment

## Run
Install Node.js 20+.

```bash
npm install
cp .env.example .env
npm start
```

Open `http://localhost:3000`.

For Windows, copy `.env.example` to `.env` manually.

## Docker
```bash
docker compose up --build
```

## Important engineering point
This is a production-oriented web MVP, but a browser cannot automatically discover arbitrary nearby phones through Bluetooth/Wi-Fi Direct while completely disconnected from the Internet. WebRTC data channels support encrypted peer-to-peer data transfer after peer discovery/signaling.

For a **true zero-internet multi-hop mesh** in the field, the recommended final client is a native Android app using supported nearby-device/Bluetooth/Wi-Fi Direct transport, while keeping this same API/database/cloud backend.

## Before real deployment
Use HTTPS, strong secret management, rate limiting, backups, monitoring, audit logs, retention rules, emergency-service authorization, and a TURN service where required. Never use the sample admin password in production.
