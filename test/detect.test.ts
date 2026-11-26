import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { PROBE_COMMAND, classifyProbeReply, isNewTekPort, probePanel, type ProbePort } from '../src/detect.js'

describe('isNewTekPort', () => {
	it('needs the FTDI ids and the NewTek manufacturer string', () => {
		const base = { path: '/dev/cu.usbserial-X', vendorId: '0403', productId: '6001' }
		expect(isNewTekPort({ ...base, manufacturer: 'NewTek' })).toBe(true)
		expect(isNewTekPort({ ...base, manufacturer: 'FTDI' })).toBe(false)
		expect(isNewTekPort({ ...base })).toBe(false)
		expect(isNewTekPort({ ...base, productId: '6015', manufacturer: 'NewTek' })).toBe(false)
	})
})

describe('classifyProbeReply', () => {
	it('recognizes the Mini by its heartbeat or its hex messages', () => {
		expect(classifyProbeReply('\r\r')).toBe('mini')
		expect(classifyProbeReply('80F2\r')).toBe('mini')
	})
	it('treats silence or LC-11 messages as another panel', () => {
		expect(classifyProbeReply('')).toBe('other')
		expect(classifyProbeReply('~47F\r')).toBe('other')
		expect(classifyProbeReply('^1DF\r')).toBe('other')
	})
	it('ignores an unfinished line and gives up on a mix of both', () => {
		expect(classifyProbeReply('80')).toBe('other')
		expect(classifyProbeReply('\r~47F\r')).toBeUndefined()
	})
})

class FakeProbePort extends EventEmitter implements ProbePort {
	written: string[] = []
	closed = false
	constructor(private readonly reply: string) {
		super()
	}
	write(data: string, cb?: (error?: Error | null) => void): void {
		this.written.push(data)
		cb?.(null)
		if (this.reply) setTimeout(() => this.emit('data', Buffer.from(this.reply, 'latin1')), 5)
	}
	close(cb?: (error?: Error | null) => void): void {
		this.closed = true
		cb?.(null)
	}
}

describe('probePanel', () => {
	it('sends the probe command, listens and closes the port', async () => {
		const port = new FakeProbePort('\r')
		expect(await probePanel(async () => port, 30)).toBe('mini')
		expect(port.written).toEqual([PROBE_COMMAND])
		expect(port.closed).toBe(true)
	})

	it('calls a silent panel "other"', async () => {
		const port = new FakeProbePort('')
		expect(await probePanel(async () => port, 30)).toBe('other')
		expect(port.closed).toBe(true)
	})

	it('reports "unknown" when the port can not be opened', async () => {
		expect(
			await probePanel(async () => {
				throw new Error('Resource busy')
			}, 30),
		).toBeUndefined()
	})
})
