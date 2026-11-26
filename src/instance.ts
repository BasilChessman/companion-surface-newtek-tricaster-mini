import {
	createModuleLogger,
	type CardGenerator,
	type ModuleLogger,
	type SurfaceContext,
	type SurfaceDrawProps,
	type SurfaceInstance,
} from '@companion-surface/base'
import { MiniParser, type MiniEvent } from './protocol.js'
import { MODEL_NAME } from './layout.js'
import { LedState, TBAR_BOTTOM_LED, TBAR_TOP_LED, colorIsLit } from './leds.js'
import { TbarEnds, tbarValue } from './tbar.js'

/** The small part of a serial port this surface needs, so tests can supply a fake. */
export interface SerialPortLike {
	on(event: 'data', listener: (data: Buffer) => void): unknown
	on(event: 'error', listener: (error: Error) => void): unknown
	on(event: 'close', listener: () => void): unknown
	write(data: string, callback?: (error?: Error | null) => void): unknown
	/** Wait until everything written has left the port. Optional so a simple fake need not have it. */
	drain?(callback?: (error?: Error | null) => void): unknown
	close(callback?: (error?: Error | null) => void): unknown
	readonly isOpen: boolean
}

/** Draw calls arrive in bursts (a page change redraws every control); LED commands are batched over this long. */
export const LED_BATCH_MS = 10

/** A knob reading never really jumps by this much; if it does (glitch), do not flood Companion with actions. */
export const MAX_ROTATE_STEPS_PER_EVENT = 16

/**
 * Minimum gap between T-bar updates. The panel reports up to about 190 positions a second; anything much
 * slower than this shows as steps when the T-bar drives a video transition. A change is sent straight away
 * when the last one is older than this, otherwise as soon as the gap has passed (always with the newest value).
 */
export const TBAR_INTERVAL_MS = 10

export class MiniSurface implements SurfaceInstance {
	readonly #logger: ModuleLogger
	readonly #surfaceId: string
	readonly #port: SerialPortLike
	readonly #context: SurfaceContext
	readonly #parser: MiniParser
	#closing = false

	readonly #leds = new LedState()
	#ledTimer: NodeJS.Timeout | undefined

	#tbarReversed = false
	#tbarRaw: number | undefined
	readonly #tbarEnds = new TbarEnds()
	#tbarPending: number | undefined
	#tbarSent: number | undefined
	#tbarSentAt = -Infinity
	#tbarTimer: NodeJS.Timeout | undefined

	public get surfaceId(): string {
		return this.#surfaceId
	}
	public get productName(): string {
		return MODEL_NAME
	}

	constructor(surfaceId: string, port: SerialPortLike, context: SurfaceContext) {
		this.#logger = createModuleLogger(`Instance/${surfaceId}`)
		this.#surfaceId = surfaceId
		this.#port = port
		this.#context = context
		this.#parser = new MiniParser((event) => this.#handleEvent(event))

		port.on('data', (data) => this.#parser.feed(data))
		port.on('error', (error) => {
			this.#logger.error(`Serial error: ${error.message}`)
			if (!this.#closing) context.disconnect(error)
		})
		port.on('close', () => {
			if (!this.#closing) context.disconnect(new Error('The TriCaster Mini panel serial port closed. Was it unplugged?'))
		})
	}

	#handleEvent(event: MiniEvent): void {
		switch (event.type) {
			case 'button':
				if (event.pressed) this.#context.keyDownById(event.controlId)
				else this.#context.keyUpById(event.controlId)
				break
			case 'rotate':
				// API 1.3 (the oldest this module supports, Companion 5.0) can only turn a control one step per
				// call; the newer rotateById(delta) does not exist there. A fast turn reports several steps at once.
				for (let i = 0, n = Math.min(Math.abs(event.delta), MAX_ROTATE_STEPS_PER_EVENT); i < n; i++) {
					if (event.delta < 0) this.#context.rotateLeftById(event.controlId)
					else this.#context.rotateRightById(event.controlId)
				}
				break
			case 'tbar': {
				this.#tbarRaw = event.raw
				this.#queueTbar(tbarValue(event.raw, this.#tbarReversed))
				// The two LEDs by the T-bar show when it is all the way up or all the way down
				const end = this.#tbarEnds.update(event.raw)
				const topChanged = this.#leds.set(TBAR_TOP_LED, end === 'top')
				const bottomChanged = this.#leds.set(TBAR_BOTTOM_LED, end === 'bottom')
				if (topChanged || bottomChanged) this.#scheduleLeds()
				break
			}
		}
	}

	#queueTbar(value: number): void {
		this.#tbarPending = value
		if (this.#tbarTimer) return // already waiting: the newest value goes when the gap has passed
		const wait = this.#tbarSentAt + TBAR_INTERVAL_MS - performance.now()
		if (wait <= 0) this.#flushTbar()
		else this.#tbarTimer = setTimeout(this.#flushTbar, wait)
	}

	#flushTbar = (): void => {
		this.#tbarTimer = undefined
		const value = this.#tbarPending
		this.#tbarPending = undefined
		if (value === undefined || this.#closing || this.#tbarSent === value) return
		this.#tbarSent = value
		this.#tbarSentAt = performance.now()
		this.#context.sendVariableValue('tbar', value)
	}

	#writeLines(lines: string[]): void {
		if (lines.length === 0 || !this.#port.isOpen) return
		this.#port.write(lines.join(''), (error) => {
			if (error) this.#logger.error(`Failed to write LED state: ${error.message}`)
		})
	}

	#flushLeds = (): void => {
		this.#ledTimer = undefined
		this.#writeLines(this.#leds.takeChanges())
	}

	#scheduleLeds(): void {
		this.#ledTimer ??= setTimeout(this.#flushLeds, LED_BATCH_MS)
	}

	async init(): Promise<void> {
		this.#writeLines(this.#leds.allGroups()) // start from a known state: every LED off
	}

	async close(): Promise<void> {
		this.#closing = true
		if (this.#ledTimer) clearTimeout(this.#ledTimer)
		this.#ledTimer = undefined
		if (this.#tbarTimer) clearTimeout(this.#tbarTimer)
		this.#tbarTimer = undefined
		this.#leds.clear()
		this.#writeLines(this.#leds.takeChanges()) // leave the panel dark: it keeps LED states until unplugged
		if (this.#port.isOpen) {
			// Let the final all-LEDs-off command leave before the port is closed
			await new Promise<void>((resolve) => {
				if (this.#port.drain) this.#port.drain(() => resolve())
				else resolve()
			})
			await new Promise<void>((resolve) => this.#port.close(() => resolve()))
		}
	}

	async updateConfig(config: Record<string, any>): Promise<void> {
		const reversed = !!config?.tbar_reverse
		if (reversed === this.#tbarReversed) return
		this.#tbarReversed = reversed
		// Send the current position the new way round straight away, if it is known
		if (this.#tbarRaw !== undefined) this.#queueTbar(tbarValue(this.#tbarRaw, reversed))
	}

	async ready(): Promise<void> {}

	async setBrightness(_percent: number): Promise<void> {
		// No brightness control was found on the panel
	}

	async blank(): Promise<void> {
		this.#leds.clear()
		this.#scheduleLeds()
	}

	async draw(_signal: AbortSignal, drawProps: SurfaceDrawProps): Promise<void> {
		// The LEDs are single-color on/off, so a lit color means on and black means off
		if (drawProps.color !== undefined && this.#leds.set(drawProps.controlId, colorIsLit(drawProps.color))) {
			this.#scheduleLeds()
		}
	}

	async showStatus(_signal: AbortSignal, _cardGenerator: CardGenerator, _statusMessage: string): Promise<void> {
		// No display to show a status on
	}
}
