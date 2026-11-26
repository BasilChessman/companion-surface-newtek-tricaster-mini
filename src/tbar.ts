/**
 * The T-bar. The panel reports 00 with the bar pulled fully down (toward the operator) and FF pushed fully
 * up, every count in between, and reaches both ends exactly, so no calibration is needed.
 *
 * Companion gets the same convention as the LC-11 module: 0 at the top (pushed away) and 255 at the bottom
 * (pulled toward you), unless the user reverses it.
 */

/** How far the T-bar must leave an end before that end's LED goes off again (stops flicker at the very end). */
export const TBAR_END_OFF = 8

/** Raw panel value in, value for Companion out. */
export function tbarValue(raw: number, reversed: boolean): number {
	return reversed ? raw : 255 - raw
}

/** Works out whether the T-bar is at one of its physical ends, from the raw panel value. */
export class TbarEnds {
	#end: 'top' | 'bottom' | null = null

	update(raw: number): 'top' | 'bottom' | null {
		if (raw >= 255) this.#end = 'top'
		else if (raw <= 0) this.#end = 'bottom'
		else if (this.#end === 'top' && raw < 255 - TBAR_END_OFF) this.#end = null
		else if (this.#end === 'bottom' && raw > TBAR_END_OFF) this.#end = null
		return this.#end
	}
}
