import type { SurfaceInputVariable, SurfaceOutputVariable, SurfaceSchemaLayoutDefinition } from '@companion-surface/base'
import { BUS_COLUMNS, FX_COLUMNS } from './protocol.js'

export const MODEL_ID = 'newtek-tricaster-mini'
export const MODEL_NAME = 'NewTek TriCaster Mini control surface'

interface ControlDef {
	/** Control id, shared by the layout, the LEDs and the parser */
	id: string
	/** Zero-based grid position in Companion */
	row: number
	column: number
	/** Legend printed on the panel */
	label: string
	kind: 'button' | 'encoder'
}

const LABELS: Record<string, string> = {
	'1': '1',
	'2': '2',
	'3': '3',
	'4': '4',
	net1: 'NET 1',
	net2: 'NET 2',
	ddr1: 'DDR 1',
	ddr2: 'DDR 2',
	gfx: 'GFX 2/1',
	black: 'BLACK/BFR',
	me1: 'M/E 1',
	me2: 'M/E 2',
	me3: 'M/E 3',
	me4: 'M/E 4',
}
const FX_LABELS: Record<string, string> = { '1': '⏮ 1', '2': '■ 2', '3': '▶ 3', '4': '⏭ 4' }

const button = (id: string, row: number, column: number, label: string): ControlDef => ({ id, row, column, label, kind: 'button' })
const knob = (id: string, row: number, column: number, label: string): ControlDef => ({ id, row, column, label, kind: 'encoder' })

/**
 * A 4 x 18 grid that follows the panel. Row 0: Switcher Delegate (above the Program M/E buttons).
 * Row 1: FX/Overlay, SHIFT/ALT, Overlay Delegate. Row 2: Program and the two knobs. Row 3: Preview, TAKE, AUTO.
 */
export const CONTROLS: readonly ControlDef[] = [
	button('delegate-main', 0, 9, 'MAIN'),
	...[1, 2, 3, 4].map((n) => button(`delegate-me${n}`, 0, 9 + n, `M/E ${n}`)),

	...FX_COLUMNS.map((c, column) => button(`fx-${c}`, 1, column, FX_LABELS[c] ?? LABELS[c])),
	button('shift', 1, 11, 'SHIFT'),
	button('alt', 1, 12, 'ALT'),
	button('bkgd', 1, 14, 'BKGD'),
	button('dsk1', 1, 15, 'DSK 1'),
	button('dsk2', 1, 16, 'DSK 2'),
	button('ftb', 1, 17, 'FTB'),

	...BUS_COLUMNS.map((c, column) => button(`pgm-${c}`, 2, column, LABELS[c])),
	knob('select-knob', 2, 15, 'SELECT'),
	knob('rate-knob', 2, 16, 'RATE'),

	...BUS_COLUMNS.map((c, column) => button(`pvw-${c}`, 3, column, LABELS[c])),
	button('take', 3, 15, 'TAKE'),
	button('auto', 3, 16, 'AUTO'),
]

/** The T-bar is analog, so Companion receives it as a variable rather than a control. */
export const TRANSFER_VARIABLES: Array<SurfaceInputVariable | SurfaceOutputVariable> = [
	{
		id: 'tbar',
		type: 'input',
		name: 'T-bar',
		description: 'T-bar position, 0 (pushed up, away from you) to 255 (pulled down), unless reversed in the settings',
	},
]

export function createLayout(): SurfaceSchemaLayoutDefinition {
	const layout: SurfaceSchemaLayoutDefinition = {
		// No bitmaps or text: the panel has no displays. Colors are requested so the host passes
		// each control's feedback color to draw(), for the button LEDs.
		stylePresets: { default: { colors: 'hex' } },
		controls: {},
	}
	for (const c of CONTROLS) layout.controls[c.id] = { row: c.row, column: c.column }
	return layout
}
