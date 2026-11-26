import { describe, expect, it } from 'vitest'
import { LED_CONTROL_IDS, LedState, TBAR_BOTTOM_LED, TBAR_TOP_LED, colorIsLit } from '../src/leds.js'
import { BUTTON_CONTROL_IDS, ENCODER_CONTROL_IDS } from '../src/protocol.js'

describe('LedState', () => {
	it('uses the commands verified on the real panel', () => {
		const leds = new LedState()
		leds.takeChanges()
		leds.set('fx-1', true)
		leds.set('pgm-1', true)
		leds.set('pvw-1', true)
		expect(leds.takeChanges().sort()).toEqual(['10FE\r', '11FE\r', '12FE\r'])
	})

	it('lights MAIN, BKGD and FTB through group 38', () => {
		const leds = new LedState()
		leds.set('delegate-main', true)
		expect(leds.takeChanges()).toEqual(['38BF\r'])
		leds.set('bkgd', true)
		expect(leds.takeChanges()).toEqual(['38AF\r'])
		leds.set('ftb', true)
		expect(leds.takeChanges()).toEqual(['388F\r'])
	})

	it('drives the T-bar LEDs in group 39: bottom is bit 0, top is bit 1', () => {
		const leds = new LedState()
		leds.set(TBAR_BOTTOM_LED, true)
		expect(leds.takeChanges()).toEqual(['39FE\r'])
		leds.set(TBAR_TOP_LED, true)
		leds.set(TBAR_BOTTOM_LED, false)
		expect(leds.takeChanges()).toEqual(['39FD\r'])
	})

	it('combines several LEDs of one group into one command and sends nothing when nothing changed', () => {
		const leds = new LedState()
		leds.set('take', true)
		leds.set('auto', true)
		expect(leds.takeChanges()).toEqual(['133F\r'])
		expect(leds.set('take', true)).toBe(false)
		expect(leds.takeChanges()).toEqual([])
	})

	it('turns everything off', () => {
		const leds = new LedState()
		leds.set('pgm-me4', true)
		leds.takeChanges()
		leds.clear()
		expect(leds.takeChanges().sort()).toEqual(['10FF\r', '11FF\r', '12FF\r', '13FF\r', '14FF\r', '15FF\r', '38FF\r', '39FF\r'])
	})

	it('has an LED for every button except the knob pushes', () => {
		const expected = BUTTON_CONTROL_IDS.filter((id) => !ENCODER_CONTROL_IDS.includes(id)).sort()
		expect([...LED_CONTROL_IDS].sort()).toEqual(expected)
		expect(new LedState().has('select-knob')).toBe(false)
	})
})

describe('colorIsLit', () => {
	it('treats black and near-black as off and any visible color as on', () => {
		expect(colorIsLit('#000000')).toBe(false)
		expect(colorIsLit('#101010')).toBe(false)
		expect(colorIsLit('#ff0000')).toBe(true)
		expect(colorIsLit('00ff00')).toBe(true)
		expect(colorIsLit('nonsense')).toBe(false)
	})
})
