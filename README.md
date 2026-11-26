# companion-surface-newtek-tricaster-mini

A [Bitfocus Companion](https://bitfocus.io/companion) surface module for the **NewTek TriCaster Mini
control surface**: 51 lit buttons, the SELECT and RATE push-knobs, and the T-bar with its end LEDs.

Built on `@companion-surface/base` 1.3, so it works on Companion 5.0 and newer.

- User guide: [`companion/HELP.md`](companion/HELP.md)
- Serial protocol, worked out from a real panel: [`PROTOCOL.md`](PROTOCOL.md)

## Development

Needs Node 22 and Yarn 4 (through corepack).

```sh
corepack yarn install
corepack yarn build
corepack yarn test
corepack yarn package   # makes the .tgz to import into Companion
```

## License

MIT
