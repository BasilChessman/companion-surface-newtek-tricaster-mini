import { describe, expect, it } from 'vitest'
import { BUTTON_CONTROL_IDS, ENCODER_CONTROL_IDS, MiniParser, type MiniEvent } from '../src/protocol.js'

function parse(...chunks: string[]): MiniEvent[] {
	const events: MiniEvent[] = []
	const parser = new MiniParser((e) => events.push(e))
	for (const chunk of chunks) parser.feed(chunk)
	return events
}

describe('MiniParser', () => {
	it('decodes TAKE and AUTO exactly as captured from the real panel', () => {
		expect(parse('13BF\r13FF\r137F\r13FF\r')).toEqual([
			{ type: 'button', controlId: 'take', pressed: true },
			{ type: 'button', controlId: 'take', pressed: false },
			{ type: 'button', controlId: 'auto', pressed: true },
			{ type: 'button', controlId: 'auto', pressed: false },
		])
	})

	it('maps every group to the captured buttons', () => {
		const press = (msg: string) => (parse(msg)[0] as { controlId: string }).controlId
		expect(press('10FE\r')).toBe('fx-1')
		expect(press('107F\r')).toBe('fx-ddr2')
		expect(press('14BF\r')).toBe('fx-gfx')
		expect(press('147F\r')).toBe('fx-black')
		expect(press('14FE\r')).toBe('pgm-gfx')
		expect(press('14DF\r')).toBe('pgm-me4')
		expect(press('11FE\r')).toBe('pgm-1')
		expect(press('12F7\r')).toBe('pvw-4')
		expect(press('13FE\r')).toBe('pvw-gfx')
		expect(press('15FE\r')).toBe('delegate-me1')
		expect(press('15EF\r')).toBe('shift')
		expect(press('15DF\r')).toBe('alt')
		expect(press('15BF\r')).toBe('dsk1')
		expect(press('157F\r')).toBe('dsk2')
	})

	it('decodes group 17, ignoring the three bits that always read 0', () => {
		// Idle is EC (bits 0, 1, 4 low). MAIN, SELECT push, RATE push, BKGD, FTB as captured.
		expect(parse('17EC\r')).toEqual([])
		expect(parse('17E8\r17EC\r')).toEqual([
			{ type: 'button', controlId: 'delegate-main', pressed: true },
			{ type: 'button', controlId: 'delegate-main', pressed: false },
		])
		const id = (msg: string) => (parse('17EC\r', msg)[0] as { controlId: string }).controlId
		expect(id('17E4\r')).toBe('select-knob')
		expect(id('17CC\r')).toBe('rate-knob')
		expect(id('17AC\r')).toBe('bkgd')
		expect(id('176C\r')).toBe('ftb')
	})

	it('reports buttons held together in one group separately', () => {
		expect(parse('157F\r153F\r157F\r15FF\r')).toEqual([
			{ type: 'button', controlId: 'dsk2', pressed: true },
			{ type: 'button', controlId: 'dsk1', pressed: true },
			{ type: 'button', controlId: 'dsk1', pressed: false },
			{ type: 'button', controlId: 'dsk2', pressed: false },
		])
	})

	it('reports the T-bar raw value', () => {
		expect(parse('8000\r80FF\r807F\r')).toEqual([
			{ type: 'tbar', raw: 0 },
			{ type: 'tbar', raw: 255 },
			{ type: 'tbar', raw: 127 },
		])
	})

	it('turns knob counters into steps, across the wrap, using the first reading as the baseline', () => {
		// SELECT turned right then left, as captured: FA FB FC ... FF 00 01 then back down
		expect(parse('19FE\r19FF\r1900\r1901\r1900\r19FF\r')).toEqual([
			{ type: 'rotate', controlId: 'select-knob', delta: 1 },
			{ type: 'rotate', controlId: 'select-knob', delta: 1 },
			{ type: 'rotate', controlId: 'select-knob', delta: 1 },
			{ type: 'rotate', controlId: 'select-knob', delta: -1 },
			{ type: 'rotate', controlId: 'select-knob', delta: -1 },
		])
		expect(parse('18FA\r18FD\r')).toEqual([{ type: 'rotate', controlId: 'rate-knob', delta: 3 }])
	})

	it('copes with messages split across reads, heartbeat CRs and noise', () => {
		expect(parse('1', '3BF', '\r\r\r', 'zz\r', '8', '0F2\r', '1600\r')).toEqual([
			{ type: 'button', controlId: 'take', pressed: true },
			{ type: 'tbar', raw: 0xf2 },
		])
	})

	it('lists 51 buttons and 2 knobs, with no duplicates', () => {
		expect(BUTTON_CONTROL_IDS).toHaveLength(53) // 51 buttons + the 2 knob pushes
		expect(new Set(BUTTON_CONTROL_IDS).size).toBe(53)
		expect(ENCODER_CONTROL_IDS).toEqual(['select-knob', 'rate-knob'])
		for (const id of ENCODER_CONTROL_IDS) expect(BUTTON_CONTROL_IDS).toContain(id)
	})
})
