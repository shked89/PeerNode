# PeerNode
PeerNode is a new level of abstraction for both synchronous and asynchronous service interaction.

It provides a clean, unified message-bus interface, making communication between services simple and efficient.
By default, PeerNode uses NATS as the transport layer, but it's designed to be adapter-friendly — allowing you to plug in different messaging systems as needed.