import { BUTTON_GROUPS } from './protocol.js'

/**
 * TriCaster Mini LED commands (host -> panel direction). See PROTOCOL.md.
 *
 * Same `GGVV` + CR format as the buttons, ACTIVE-LOW: a 0 bit lights the LED, a 1 bit turns it off.
 * Groups 10 to 15 use the same bits as the buttons. MAIN, BKGD and FTB report in group 17 but are lit
 * through group 38, and the two T-bar LEDs are in group 39. The knob pushes have no LEDs.
 *
 * The LEDs are single-color on/off (the color is fixed per button: Program red, Preview green, Switcher
 * Delegate M/E red, everything else white) and no brightness control was found. The panel keeps each
 * LED's state until it is changed or the panel is unplugged.
 */

/** The two LEDs by the T-bar. They are not buttons, so they have no control id in the layout. */
export const TBAR_TOP_LED = 'tbar-top-led'
export const TBAR_BOTTOM_LED = 'tbar-bottom-led'

interface LedGroup {
	/** Group id, eg `10` */
	readonly head: string
	/** Bit number for each control id that has an LED in this group */
	readonly bits: Readonly<Record<string, number>>
}

const sameAsButtons = (group: string): LedGroup => ({
	head: group,
	bits: Object.fromEntries(BUTTON_GROUPS[group].map(([bit, id]) => [id, bit])),
})

export const LED_GROUPS: readonly LedGroup[] = [
	...['10', '11', '12', '13', '14', '15'].map(sameAsButtons),
	{ head: '38', bits: { bkgd: 4, ftb: 5, 'delegate-main': 6 } },
	{ head: '39', bits: { [TBAR_BOTTOM_LED]: 0, [TBAR_TOP_LED]: 1 } },
]

/** Control ids of the buttons that have an LED (the T-bar LEDs are driven separately, from the T-bar position). */
export const LED_CONTROL_IDS: readonly string[] = LED_GROUPS.flatMap((g) => Object.keys(g.bits)).filter(
	(id) => id !== TBAR_TOP_LED && id !== TBAR_BOTTOM_LED,
)

/**
 * Whether a Companion background color should light the LED. The LEDs are on/off only, so any
 * visible color means on and black (an unused button) means off.
 */
export function colorIsLit(color: string): boolean {
	const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color.trim())
	if (!m) return false
	return Math.max(parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)) >= 0x30
}

/** Tracks which LEDs are lit and produces the command lines that change them. */
export class LedState {
	readonly #lit = new Set<string>()
	readonly #groupOf = new Map<string, LedGroup>()
	readonly #dirty = new Set<LedGroup>()

	constructor() {
		for (const group of LED_GROUPS) for (const id of Object.keys(group.bits)) this.#groupOf.set(id, group)
	}

	/** True if the control has an LED. */
	has(controlId: string): boolean {
		return this.#groupOf.has(controlId)
	}

	/** Set one LED. Returns true if that changed anything. */
	set(controlId: string, lit: boolean): boolean {
		const group = this.#groupOf.get(controlId)
		if (!group || this.#lit.has(controlId) === lit) return false
		if (lit) this.#lit.add(controlId)
		else this.#lit.delete(controlId)
		this.#dirty.add(group)
		return true
	}

	/** Turn every LED off in the state (takeChanges() then gives the commands that do it on the panel). */
	clear(): void {
		this.#lit.clear()
		for (const group of LED_GROUPS) this.#dirty.add(group)
	}

	static #line(group: LedGroup, lit: ReadonlySet<string>): string {
		let value = 0xff
		for (const [id, bit] of Object.entries(group.bits)) if (lit.has(id)) value &= ~(1 << bit)
		return `${group.head}${value.toString(16).toUpperCase().padStart(2, '0')}\r`
	}

	/** The command lines for every group changed since the last call, then forgets them. */
	takeChanges(): string[] {
		const lines = [...this.#dirty].map((g) => LedState.#line(g, this.#lit))
		this.#dirty.clear()
		return lines
	}

	/** Command lines that put every LED of the panel into its current state (used on connect). */
	allGroups(): string[] {
		this.#dirty.clear()
		return LED_GROUPS.map((g) => LedState.#line(g, this.#lit))
	}
}
