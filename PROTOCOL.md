# NewTek TriCaster Mini control surface: serial protocol

Worked out in November 2026 by capturing a real panel and probing its LEDs. Treat it as "verified on one
panel", not as an official specification.

## Connection

- USB 0403:6001 (FTDI FT232R), USB vendor string "NewTek", product string "NewTek Control Surface".
  It appears as a serial port, for example `/dev/cu.usbserial-XXXXXXXX` on macOS.
- 9600 baud, 8N1, no flow control. (Same as the LC-11, but a different message format.)
- Every message is 4 ASCII hex characters `GGVV` + CR (0x0D). `GG` = group, `VV` = 8-bit value.
- Buttons and LEDs are **active-low**: bit = 0 means pressed / lit.
- Each change sends the whole group byte, so held buttons in the same group combine (e.g. `153F`).
- The panel sends nothing until touched. **Once it has received any byte from the host it sends a bare CR
  about every 0.25 s** (heartbeat). The LC-11 never does this: useful to tell them apart.
- `FIRMWARE` (from the other person's Windows tool) gets no name reply on this panel.

## Panel to host

| Group | bit 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `10` | FX 1 (⏮) | FX 2 (■) | FX 3 (▶) | FX 4 (⏭) | FX NET 1 | FX NET 2 | FX DDR 1 | FX DDR 2 |
| `14` | PGM GFX 2/1 | PGM BLACK/BFR | PGM M/E 1 | PGM M/E 2 | PGM M/E 3 | PGM M/E 4 | FX GFX 2/1 | FX BLACK/BFR |
| `11` | PGM 1 | PGM 2 | PGM 3 | PGM 4 | PGM NET 1 | PGM NET 2 | PGM DDR 1 | PGM DDR 2 |
| `12` | PVW 1 | PVW 2 | PVW 3 | PVW 4 | PVW NET 1 | PVW NET 2 | PVW DDR 1 | PVW DDR 2 |
| `13` | PVW GFX 2/1 | PVW BLACK/BFR | PVW M/E 1 | PVW M/E 2 | PVW M/E 3 | PVW M/E 4 | TAKE | AUTO |
| `15` | Delegate M/E 1 | Delegate M/E 2 | Delegate M/E 3 | Delegate M/E 4 | SHIFT | ALT | DSK 1 | DSK 2 |
| `17` | (always 0) | (always 0) | MAIN | SELECT push | (always 0) | RATE push | BKGD | FTB |

Group `17` idles at `EC` (bits 0, 1, 4 read 0 all the time): mask them out.

| Message | Meaning |
| --- | --- |
| `80hh` | T-bar, `00` at one end to `FF` at the other. Full 8-bit, every count reported, up to ~190 msgs/s. |
| `19hh` | SELECT knob counter, 8-bit wrapping. Up when turned right (clockwise), down when left. |
| `18hh` | RATE knob counter, same. |

## Host to panel (LEDs)

Same `GGVV` + CR format, 0 bit = lit. The panel keeps state until changed or unplugged.

| Group | LEDs |
| --- | --- |
| `10`, `11`, `12`, `13`, `14`, `15` | Same bits as the buttons above |
| `38` | bit 4 BKGD, bit 5 FTB, bit 6 MAIN (bits 0–3, 7: nothing seen) |

- `34` = same LEDs as `14`, `35` = same as `15`, `43` = same as `13` (aliases; not needed).
- `16`: nothing visible. `17xx`: no LEDs (the other tool uses `1701`–`1708` as "backlight" levels; no
  visible effect here, buttons stay fully dark when off).
- SELECT/RATE pushes have no LEDs. AUTO and TAKE do.

Colors are fixed per button (single color, on/off):
- Program row: red. Preview row: green. Switcher Delegate M/E 1–4: red.
- White: FX/Overlay row, SHIFT, ALT, DSK 1, DSK 2, BKGD, FTB, MAIN, TAKE, AUTO.

All off: `10FF 11FF 12FF 13FF 14FF 15FF 38FF`.

## Source of hints

A third-party Windows panel simulator for the TC40, TC460 and TCXD850 surfaces (compiled, no source)
gave the `GGVV` format, the `80` T-bar group and the `34/35/38/43` LED groups. Everything above was then
checked on a real TriCaster Mini panel.
