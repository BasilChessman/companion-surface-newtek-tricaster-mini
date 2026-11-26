## NewTek TriCaster Mini control surface

A Companion surface module for the **NewTek TriCaster Mini control surface** (the panel with the
Switcher Delegate, FX/Overlay, Program and Preview rows, SELECT and RATE knobs, TAKE, AUTO and a T-bar).

Requires **Companion 5.0 or newer**. Close the TriCaster software or anything else that uses the panel
first: only one program can use its serial port at a time.

If you also use the **NewTek LC-11** module, update it to **0.2.3 or newer**. Older versions mistake the
Mini for an LC-11 and take it over.

### What you get

- All **51 buttons**, each with its LED following the button's color in Companion.
- The **SELECT** and **RATE** knobs, which can be pressed **and** turned.
- The **T-bar** as a surface variable, with its two end LEDs.

### Layout

The surface is a grid of 4 rows by 18 columns that follows the panel:

| Row | Columns 0 to 13 | Right side |
|---|---|---|
| 0 | Switcher Delegate: MAIN in column 9, M/E 1 to 4 in columns 10 to 13 (above Program M/E 1 to 4) | |
| 1 | FX/Overlay: ⏮1, ■2, ▶3, ⏭4, NET 1, NET 2, DDR 1, DDR 2, GFX 2/1, BLACK/BFR (columns 0 to 9); SHIFT and ALT in columns 11 and 12 | BKGD, DSK 1, DSK 2, FTB in columns 14 to 17 |
| 2 | Program: 1, 2, 3, 4, NET 1, NET 2, DDR 1, DDR 2, GFX 2/1, BLACK/BFR, M/E 1 to 4 | SELECT knob in column 15, RATE knob in column 16 |
| 3 | Preview, the same 14 buttons | TAKE in column 15, AUTO in column 16 |

### Layout page

A ready-made Companion page with every control labeled in its grid position is attached to each
[release](https://github.com/BasilChessman/companion-surface-newtek-tricaster-mini/releases) as
**newtek-tricaster-mini-layout.companionconfig**. Import it on the **Import/Export** page onto an empty
page.

### Button lights

Each button lights when its Companion button has a background color, and goes dark when the
background is black. The panel's lights are on/off only and their colors are fixed: Program buttons are
red, Preview buttons green, Switcher Delegate M/E buttons red, and every other button white. No
brightness control has been found, so leave unused buttons black if the panel is too bright.

### Using the knobs for rotation

Companion only shows rotate actions on buttons that ask for them:

1. Select a knob position (SELECT or RATE) in the **Buttons** grid.
2. Open the **Options** tab of the button editor. If your window is narrow the tab can be off the right
   edge: widen the panel or zoom the browser out.
3. Turn on **Rotary Actions**.
4. On the first tab, add actions under **Rotate left actions** and **Rotate right actions**.

Pressing the knob is an ordinary button press on the same position.

### T-bar

The T-bar is analog, so it comes into Companion as a variable rather than a button.

1. On the **Variables** page, open **Custom Variables** and add one, for example `tbar`.
2. On the **Surfaces** page, click the panel to open its settings, and pick that custom variable in the
   **T-bar** dropdown.
3. Move the T-bar: the custom variable now follows it, for example `$(custom:tbar)`.

| Value | Range |
|---|---|
| T-bar | 0 pushed all the way up (away from you) to 255 pulled all the way down. Updates are sent as fast as every 10 ms, for smooth transitions. Tick **Reverse T-bar direction** in the surface settings to swap the ends. |

The two LEDs by the T-bar light when it is all the way up or all the way down. They stay dark until the
T-bar has moved once after the surface connects, because the panel does not report its position until it
moves.

### Troubleshooting

- **The panel isn't listed.** Make sure nothing else has it open (the TriCaster software, or an LC-11
  module older than 0.2.3), then use **Scan for devices** on the Surfaces page.
- **On Windows the panel isn't found.** Windows may report the maker as "FTDI" instead of "NewTek"; this
  module only opens ports that say "NewTek", so it never disturbs other devices that use the same chip.
