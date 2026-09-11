# Nftato shell sources

`Nftato.sh` remains a self-contained download for users and remote deployment.
Its maintained source is split here by responsibility:

- `00-runtime.sh`: process configuration, platform detection and installation
- `10-base-rules.sh`: owned tables, base rules and persistence
- `20-outbound.sh`: outbound blocking
- `30-inbound.sh`: inbound port and address rules
- `40-ddos.sh`: DDoS rules and address sets
- `50-cli.sh`: update, help and non-interactive adapters
- `60-main.sh`: interactive menu and compatibility dispatch

Run `npm run build:nftato` after editing a module. CI should run
`npm run check:nftato` to reject stale or divergent generated entrypoints.

