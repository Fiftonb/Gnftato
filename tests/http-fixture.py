"""Dual-stack HTTP listener without DNS lookups, for isolated network tests."""
import http.server
import socket
import socketserver
import sys


class Server(socketserver.ThreadingMixIn, socketserver.TCPServer):
    address_family = socket.AF_INET6
    allow_reuse_address = True
    daemon_threads = True


with Server(("::", int(sys.argv[1])), http.server.SimpleHTTPRequestHandler) as server:
    server.serve_forever()
