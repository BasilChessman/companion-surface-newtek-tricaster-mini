import {
	createModuleLogger,
	type DetectionSurfaceInfo,
	type OpenSurfaceResult,
	type SurfaceContext,
	type SurfacePlugin,
} from '@companion-surface/base'
import { SerialPort } from 'serialport'
import { MiniSurface } from './instance.js'
import { MODEL_NAME, TRANSFER_VARIABLES, createLayout } from './layout.js'
import { describeReply, isNewTekPort, probePanel, type PanelKind, type ProbePort } from './detect.js'

export interface MiniPluginInfo {
	/** Serial port path, eg /dev/cu.usbserial-FT0A1B2C or COM3 */
	path: string
}

const BAUD_RATE = 9600

/** If a port is busy while probing (another NewTek module may be probing it too), try again this many times. */
const PROBE_ATTEMPTS = 3
const PROBE_RETRY_MS = 1200

const logger = createModuleLogger('Plugin')

function openPort(path: string): Promise<SerialPort> {
	return new Promise((resolve, reject) => {
		// lock (the default) opens the port exclusively, so a panel in use by another program is left alone
		const port = new SerialPort({ path, baudRate: BAUD_RATE, dataBits: 8, stopBits: 1, parity: 'none', autoOpen: false, lock: true })
		port.open((error) => {
			if (error) {
				reject(
					new Error(
						`Failed to open ${path}: ${error.message}. Is another program, such as the TriCaster software or the NewTek LC-11 Companion module (before 0.2.3), using the panel?`,
					),
				)
			} else {
				resolve(port)
			}
		})
	})
}

/** What each NewTek port turned out to be, by serial number (or path). Kept until the port disappears. */
const known = new Map<string, PanelKind>()

const keyOf = (port: { path: string; serialNumber?: string }): string => port.serialNumber ?? port.path

async function identify(path: string): Promise<PanelKind | undefined> {
	for (let attempt = 1; attempt <= PROBE_ATTEMPTS; attempt++) {
		const kind = await probePanel(
			() => openPort(path) as Promise<ProbePort>,
			undefined,
			(reply, result) => logger.info(`Checked the NewTek panel at ${path}: heard ${describeReply(reply)}, so ${result ?? 'unclear'}`),
		)
		if (kind) return kind
		if (attempt < PROBE_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, PROBE_RETRY_MS))
	}
	return undefined
}

const MiniPlugin: SurfacePlugin<MiniPluginInfo> = {
	async init() {
		logger.info('NewTek TriCaster Mini plugin initialized')
	},

	async destroy() {
		known.clear()
	},

	async scanForSurfaces(): Promise<DetectionSurfaceInfo<MiniPluginInfo>[]> {
		const ports = (await SerialPort.list()).filter(isNewTekPort)

		// Forget panels that have been unplugged, so a different panel on the same port is probed afresh
		const present = new Set(ports.map(keyOf))
		for (const key of known.keys()) if (!present.has(key)) known.delete(key)

		const found: DetectionSurfaceInfo<MiniPluginInfo>[] = []
		for (const port of ports) {
			let kind = known.get(keyOf(port))
			if (!kind) {
				kind = await identify(port.path)
				if (!kind) {
					logger.debug(`Could not check the NewTek panel at ${port.path} (busy?); will try again on the next scan`)
					continue
				}
				known.set(keyOf(port), kind)
				logger.info(`NewTek panel at ${port.path} is ${kind === 'mini' ? 'a TriCaster Mini control surface' : 'not a TriCaster Mini'}`)
			}
			if (kind !== 'mini') continue
			found.push({
				surfaceId: `newtek-tricaster-mini:${port.serialNumber ?? port.path}`,
				surfaceIdIsNotUnique: port.serialNumber === undefined,
				description: MODEL_NAME,
				deviceHandle: port.path,
				pluginInfo: { path: port.path },
			})
		}
		return found
	},

	async openSurface(surfaceId: string, pluginInfo: MiniPluginInfo, context: SurfaceContext): Promise<OpenSurfaceResult> {
		const port = await openPort(pluginInfo.path)
		logger.info(`Opened TriCaster Mini panel at ${pluginInfo.path} (${surfaceId})`)

		return {
			surface: new MiniSurface(surfaceId, port, context),
			registerProps: {
				brightness: false,
				surfaceLayout: createLayout(),
				transferVariables: TRANSFER_VARIABLES,
				pincodeMap: null,
				location: null,
				configFields: [
					{
						id: 'tbar_reverse',
						type: 'checkbox',
						label: 'Reverse T-bar direction',
						default: false,
						tooltip: 'Normally the T-bar reads 0 pushed all the way up (away from you) and 255 pulled all the way down. Tick to swap.',
					},
				],
			},
		}
	},
}

export default MiniPlugin
