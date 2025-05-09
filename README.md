# PeerNode
**PeerNode** provides a clean, unified message-bus interface, making communication between services simple and efficient.
By default, PeerNode uses NATS as the transport layer, but it's designed to be adapter-friendly — allowing you to plug in different messaging systems as needed.

## 🚀 Features

- 🔁 **Unified communication interface** for services (sync + async)
- 🔌 **Pluggable transport layer** (currently supports NATS, easily extendable)
- 🧱 **Modular and extensible** design for future integrations
- ⚡ **Lightweight** and easy to integrate

## 📦 Installation

⚠️ **Note:** This project is currently in early access and testing phase.  
It is not yet published on npm, but will be available soon.

To experiment locally, you can clone the repository and use it directly:

```bash
git clone https://github.com/shked89/PeerNode.git
cd PeerNode
npm install
```
