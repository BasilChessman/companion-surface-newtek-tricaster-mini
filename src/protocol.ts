/**
 * NewTek TriCaster Mini control surface serial protocol (panel -> host direction). See PROTOCOL.md.
 *
 * FTDI FT232 serial port (USB 0403:6001), 9600 baud, 8N1. Every message is 4 ASCII hex characters
 * `GGVV` + CR: a group and an 8-bit value. Buttons are ACTIVE-LOW: a bit reads 0 while the button is held.
 * The whole group is sent on every change, so buttons held together in one group combine.
 *
 *   10  FX row 1, 2, 3, 4, NET 1, NET 2, DDR 1, DDR 2                    (bit 0 ... bit 7)
 *   14  PGM GFX, PGM BLACK, PGM M/E 1-4, FX GFX, FX BLACK
 *   11  PGM 1, 2, 3, 4, NET 1, NET 2, DDR 1, DDR 2
 *   12  PVW 1, 2, 3, 4, NET 1, NET 2, DDR 1, DDR 2
 *   13  PVW GFX, PVW BLACK, PVW M/E 1-4, TAKE, AUTO
 *   15  Delegate M/E 1-4, SHIFT, ALT, DSK 1, DSK 2
 *   17  bit 2 MAIN, 3 SELECT push, 5 RATE push, 6 BKGD, 7 FTB   (bits 0, 1, 4 always read 0)
 *   19  SELECT knob counter, 8-bit wrapping, rises when turned right
 *   18  RATE knob counter, same
 *   80  T-bar, 00 pulled fully down (toward the operator) ... FF pushed fully up
 *
 * Once the panel has received a certain command (`16xx`) it also sends a bare CR about every 0.25 s.
 * Those empty lines are ignored here.
 */

export type MiniEvent =
	| { type: 'button'; controlId: string; pressed: boolean }
	| { type: 'rotate'; controlId: string; delta: number }
	| { type: 'tbar'; raw: number }

/** The ten buttons of the FX/Overlay row, in panel order */
export const FX_COLUMNS = ['1', '2', '3', '4', 'net1', 'net2', 'ddr1', 'ddr2', 'gfx', 'black'] as const
/** The fourteen buttons of the Program and Preview rows, in panel order */
export const BUS_COLUMNS = ['1', '2', '3', '4', 'net1', 'net2', 'ddr1', 'ddr2', 'gfx', 'black', 'me1', 'me2', 'me3', 'me4'] as const

/** Bit number -> control id, for one group */
type BitMap = ReadonlyArray<readonly [bit: number, controlId: string]>

const bits = (ids: readonly string[]): BitMap => ids.map((id, bit) => [bit, id] as const)

/** Every button group the panel reports, by group id. The same bits drive the LEDs (see leds.ts). */
export const BUTTON_GROUPS: Readonly<Record<string, BitMap>> = {
	'10': bits(FX_COLUMNS.slice(0, 8).map((c) => `fx-${c}`)),
	'14': bits(['pgm-gfx', 'pgm-black', 'pgm-me1', 'pgm-me2', 'pgm-me3', 'pgm-me4', 'fx-gfx', 'fx-black']),
	'11': bits(BUS_COLUMNS.slice(0, 8).map((c) => `pgm-${c}`)),
	'12': bits(BUS_COLUMNS.slice(0, 8).map((c) => `pvw-${c}`)),
	'13': bits(['pvw-gfx', 'pvw-black', 'pvw-me1', 'pvw-me2', 'pvw-me3', 'pvw-me4', 'take', 'auto']),
	'15': bits(['delegate-me1', 'delegate-me2', 'delegate-me3', 'delegate-me4', 'shift', 'alt', 'dsk1', 'dsk2']),
	'17': [
		[2, 'delegate-main'],
		[3, 'select-knob'],
		[5, 'rate-knob'],
		[6, 'bkgd'],
		[7, 'ftb'],
	],
}

/** Counter group -> knob control id */
const ENCODERS: Readonly<Record<string, string>> = { '19': 'select-knob', '18': 'rate-knob' }

const TBAR_GROUP = '80'

/** Control ids of every button the parser can report (the knob pushes included). */
export const BUTTON_CONTROL_IDS: readonly string[] = Object.values(BUTTON_GROUPS).flatMap((g) => g.map(([, id]) => id))
/** Control ids of the knobs that also report rotation. */
export const ENCODER_CONTROL_IDS: readonly string[] = ['select-knob', 'rate-knob']

const MESSAGE = /^([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/

export class MiniParser {
	#buffer = ''
	readonly #groups = new Map<string, number>()
	readonly #counters = new Map<string, number>()

	constructor(private readonly emit: (event: MiniEvent) => void) {}

	/** Feed raw bytes (or already-decoded text) from the serial port. */
	feed(data: Uint8Array | string): void {
		this.#buffer += typeof data === 'string' ? data : Buffer.from(data).toString('latin1')
		let end: number
		while ((end = this.#buffer.indexOf('\r')) >= 0) {
			const token = this.#buffer.slice(0, end).trim()
			this.#buffer = this.#buffer.slice(end + 1)
			if (token) this.#message(token)
		}
		// Garbage with no terminator: drop it so the next real message can resynchronize.
		if (this.#buffer.length > 64) this.#buffer = ''
	}

	#message(token: string): void {
		const m = MESSAGE.exec(token)
		if (!m) return
		const group = m[1].toUpperCase()
		const value = parseInt(m[2], 16)
		if (group === TBAR_GROUP) {
			this.emit({ type: 'tbar', raw: value })
		} else if (group in ENCODERS) {
			this.#encoder(ENCODERS[group], value)
		} else if (group in BUTTON_GROUPS) {
			this.#diff(group, value, BUTTON_GROUPS[group])
		}
	}

	#diff(group: string, value: number, map: BitMap): void {
		const previous = this.#groups.get(group) ?? 0xff // nothing held
		this.#groups.set(group, value)
		for (const [bit, controlId] of map) {
			const was = !(previous & (1 << bit))
			const now = !(value & (1 << bit))
			if (was !== now) this.emit({ type: 'button', controlId, pressed: now })
		}
	}

	#encoder(controlId: string, value: number): void {
		const previous = this.#counters.get(controlId)
		this.#counters.set(controlId, value)
		if (previous === undefined) return // the first reading only sets the baseline
		const delta = ((value - previous + 128) & 0xff) - 128
		if (delta !== 0) this.emit({ type: 'rotate', controlId, delta })
	}
}
