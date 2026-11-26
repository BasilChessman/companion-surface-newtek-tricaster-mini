import { describe, expect, it } from 'vitest'
import { CONTROLS, createLayout } from '../src/layout.js'
import { BUTTON_CONTROL_IDS, ENCODER_CONTROL_IDS } from '../src/protocol.js'

describe('layout', () => {
	it('has exactly the controls the panel reports', () => {
		expect(CONTROLS.map((c) => c.id).sort()).toEqual([...BUTTON_CONTROL_IDS].sort())
		expect(CONTROLS.filter((c) => c.kind === 'encoder').map((c) => c.id)).toEqual([...ENCODER_CONTROL_IDS])
	})

	it('never puts two controls in the same grid cell', () => {
		const cells = CONTROLS.map((c) => `${c.row},${c.column}`)
		expect(new Set(cells).size).toBe(cells.length)
	})

	it('fits a 4 x 18 grid with Program and Preview lined up', () => {
		for (const c of CONTROLS) {
			expect(c.row).toBeGreaterThanOrEqual(0)
			expect(c.row).toBeLessThan(4)
			expect(c.column).toBeGreaterThanOrEqual(0)
			expect(c.column).toBeLessThan(18)
		}
		const at = (id: string) => CONTROLS.find((c) => c.id === id)!
		expect(at('pgm-me4').column).toBe(at('pvw-me4').column)
		expect(at('delegate-me1').column).toBe(at('pgm-me1').column)
	})

	it('produces a layout entry per control', () => {
		expect(Object.keys(createLayout().controls)).toHaveLength(CONTROLS.length)
	})
})
