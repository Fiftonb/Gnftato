# Firewall regression tests

The test uses real nftables/iptables rules and network namespaces. Run it in a
**disposable privileged Linux container**, never with host networking. It does
not initialize or modify the host firewall and needs no internet during tests.
The repository is mounted read-only; all generated firewall files stay inside
the disposable container.

```sh
docker build -t gnftato-firewall-test -f tests/Dockerfile tests
docker run --rm --privileged --network none \
  -v "$PWD:/workspace:ro" gnftato-firewall-test
```

Coverage: IPv4/IPv6 Web and SSH access, custom Web ports, default and user-defined Docker
bridge egress and return traffic, blocked unsolicited inbound forwarding,
Docker isolation/NAT preservation, save/reload/rebuild behavior, invalid ports,
failed initialization, IPv6 SSH listener parsing, first-run failure handling, single-pass automatic initialization, and the standalone
CentOS initializer and CentOS/Debian config paths.
The networking fixture models Docker's bridges and firewall tables; it does not
run a Docker daemon inside the test container.
