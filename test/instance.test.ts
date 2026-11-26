import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SurfaceContext } from '@companion-surface/base'
import { LED_BATCH_MS, MAX_ROTATE_STEPS_PER_EVENT, MiniSurface, TBAR_INTERVAL_MS, type SerialPortLike } from '../src/instance.js'

class FakePort extends EventEmitter implements SerialPortLike {
	isOpen = true
	/** Everything the surface wrote to the panel, one entry per write call */
	written: string[] = []
	write(data: string, cb?: (error?: Error | null) => void): void {
		this.written.push(data)
		cb?.(null)
	}
	close(cb?: (error?: Error | null) => void): void {
		this.isOpen = false
		cb?.(null)
		this.emit('close')
	}
	send(text: string): void {
		this.emit('data', Buffer.from(text, 'latin1'))
	}
}

function makeContext() {
	return {
		keyDownById: vi.fn(),
		keyUpById: vi.fn(),
		rotateLeftById: vi.fn(),
		rotateRightById: vi.fn(),
		sendVariableValue: vi.fn(),
		disconnect: vi.fn(),
	} as unknown as SurfaceContext &
		Record<'keyDownById' | 'keyUpById' | 'rotateLeftById' | 'rotateRightById' | 'sendVariableValue' | 'disconnect', ReturnType<typeof vi.fn>>
}

const draw = (surface: MiniSurface, controlId: string, color: string) =>
	surface.draw(new AbortController().signal, { controlId, color } as never)

describe('MiniSurface', () => {
	let port: FakePort
	let ctx: ReturnType<typeof makeContext>
	let surface: MiniSurface

	beforeEach(async () => {
		vi.useFakeTimers()
		port = new FakePort()
		ctx = makeContext()
		surface = new MiniSurface('newtek-tricaster-mini:TEST', port, ctx)
		await surface.init()
	})
	afterEach(async () => {
		await surface.close()
		vi.useRealTimers()
	})

	it('identifies itself and switches every LED off when it connects', () => {
		expect(surface.surfaceId).toBe('newtek-tricaster-mini:TEST')
		expect(surface.productName).toBe('NewTek TriCaster Mini control surface')
		expect(port.written).toEqual(['10FF\r11FF\r12FF\r13FF\r14FF\r15FF\r38FF\r39FF\r'])
	})

	it('turns panel button presses into key down and key up', () => {
		port.send('11FE\r11FF\r')
		expect(ctx.keyDownById).toHaveBeenCalledExactlyOnceWith('pgm-1')
		expect(ctx.keyUpById).toHaveBeenCalledExactlyOnceWith('pgm-1')
	})

	it('turns knob turns into left and right steps on the same control as the knob press', () => {
		port.send('19F0\r19F1\r19F2\r19F1\r')
		expect(ctx.rotateRightById.mock.calls).toEqual([['select-knob'], ['select-knob']])
		expect(ctx.rotateLeftById.mock.calls).toEqual([['select-knob']])
		port.send('17EC\r17E4\r17EC\r')
		expect(ctx.keyDownById).toHaveBeenCalledWith('select-knob')
		expect(ctx.keyUpById).toHaveBeenCalledWith('select-knob')
	})

	it('limits the steps from one glitchy knob reading', () => {
		port.send('1800\r1870\r')
		expect(ctx.rotateRightById).toHaveBeenCalledTimes(MAX_ROTATE_STEPS_PER_EVENT)
	})

	it('sends the T-bar as 0 at the top and 255 at the bottom, at most every few ms with the newest value', () => {
		port.send('80FF\r') // pushed fully up
		expect(ctx.sendVariableValue).toHaveBeenLastCalledWith('tbar', 0)
		port.send('80F0\r80E0\r8000\r') // pulled down quickly
		expect(ctx.sendVariableValue).toHaveBeenCalledTimes(1)
		vi.advanceTimersByTime(TBAR_INTERVAL_MS)
		expect(ctx.sendVariableValue).toHaveBeenCalledTimes(2)
		expect(ctx.sendVariableValue).toHaveBeenLastCalledWith('tbar', 255)
	})

	it('reverses the T-bar when asked, straight away', async () => {
		port.send('8010\r')
		expect(ctx.sendVariableValue).toHaveBeenLastCalledWith('tbar', 0xef)
		vi.advanceTimersByTime(TBAR_INTERVAL_MS)
		await surface.updateConfig({ tbar_reverse: true })
		expect(ctx.sendVariableValue).toHaveBeenLastCalledWith('tbar', 0x10)
	})

	it('lights the T-bar end LEDs at the ends of travel', () => {
		port.written = []
		port.send('8000\r')
		vi.advanceTimersByTime(LED_BATCH_MS)
		expect(port.written).toEqual(['39FE\r']) // bottom
		port.send('8080\r')
		vi.advanceTimersByTime(LED_BATCH_MS)
		port.send('80FF\r')
		vi.advanceTimersByTime(LED_BATCH_MS)
		expect(port.written).toEqual(['39FE\r', '39FF\r', '39FD\r'])
	})

	it('batches LED changes from a burst of draws into one write', async () => {
		port.written = []
		await draw(surface, 'pgm-1', '#ff0000')
		await draw(surface, 'pvw-1', '#00ff00')
		await draw(surface, 'delegate-main', '#ffffff')
		await draw(surface, 'select-knob', '#ffffff') // no LED: ignored
		expect(port.written).toEqual([])
		vi.advanceTimersByTime(LED_BATCH_MS)
		expect(port.written).toHaveLength(1)
		expect(port.written[0].split('\r').filter(Boolean).sort()).toEqual(['11FE', '12FE', '38BF'])
	})

	it('switches every LED off when it closes', async () => {
		await draw(surface, 'take', '#ffffff')
		vi.advanceTimersByTime(LED_BATCH_MS)
		port.written = []
		await surface.close()
		expect(port.written[0].split('\r').filter(Boolean)).toHaveLength(8)
		expect(port.written[0]).toContain('13FF\r')
		expect(port.isOpen).toBe(false)
		expect(ctx.disconnect).not.toHaveBeenCalled()
	})

	it('tells Companion when the panel is unplugged', () => {
		port.emit('close')
		expect(ctx.disconnect).toHaveBeenCalledOnce()
	})
})
