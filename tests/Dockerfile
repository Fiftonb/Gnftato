FROM alpine:3.22
RUN apk add --no-cache bash nftables iptables iproute2 curl python3 shellcheck
WORKDIR /workspace
CMD ["bash", "tests/firewall-integration.sh"]
