import * as SerialPort from 'serialport';
import * as usbDetect from 'usb-detection';
import { TextDecoder } from 'util';

export interface CloseEvent {
    disconnected: boolean,
    message: string,
}

const log = (msg: string) => {
    console.log(msg);
};

const wait = (t: number): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, t));

const retry = async <T>(f: () => Promise<T>, times: number, timeout: number): Promise<T> => {
    let i = 0;
    while (i++ < times) {
        try {
            const res = await f();
            return res;
        } catch (e) {
            log(`Error: ${e.message}`);
        }
        await wait(timeout);
    }
    return Promise.reject();
}

let port: SerialPort;

const startSerialMonitor = async (serialNumber: string): Promise<void> => {
    const options: SerialPort.OpenOptions = {
        baudRate: 9600,
        autoOpen: false,
    };

    const getSerialPathTimes = 100;
    const getSerialPathTimeout = 1000;
    const retryGetSerialPath = async (serialNumber: string): Promise<string> => {
        return retry(async () => {
            const p = await getSerialPath(serialNumber);
            if (p) {
                return p;
            } else {
                return Promise.reject(Error(`No serial path found for ${serialNumber}`));
            }
        }, getSerialPathTimes, getSerialPathTimeout);
    };
    const path = await retryGetSerialPath(serialNumber);
    if (!path) {
        log(`No serial path found for ${serialNumber}`);
        return;
    }
    port = new SerialPort(path, options)

    const parser = new SerialPort.parsers.ByteLength({ length: 1 });
    const decoder = new TextDecoder();

    port.pipe(parser);

    port.on('open', () => {
        parser.on('data', data => {
            data = decoder.decode(data);
            data = data.replace(/\n/g, '\r\n');
            log(data);
        });
    });

    port.on('close', (event: CloseEvent) => {
        log(`closing connection to ${path}...`);
        port.removeAllListeners();
    });

    port.on('error', (error: Error) => {
        log('error!');
        log(error.toString());
        port.removeAllListeners();
    });

    const retryConnectTimes = 1000;
    const retryConnectTimeout = 5 * 1000; // 5 second
    const connect = () => new Promise<void>((resolve, reject) => {
        if (port.isOpen) {
            resolve();
            return;
        }
        port.open((error: Error | null | undefined) => {
            if (error) {
                reject(error);
                return;
            } else {
                resolve();
            }
        });
    });

    const retryConnect = async () => {
        try {
            await retry(() => connect(), retryConnectTimes, retryConnectTimeout);            
            log(`Connection to ${path} was successful`);
        } catch (e) {
            log(`Failed to connect to serial port ${path}`);
        }
    }
    await retryConnect();
};

const stopSerialMonitor = async () => {
    if (!port.isOpen) {
        return;
    }
    port.close();
};

const getSerialPath = async (serialNumber: string): Promise<string | undefined> => {
    const ports = await SerialPort.list();
    const portInfo = ports.find(p => p.serialNumber?.toLocaleLowerCase() === serialNumber.toLocaleLowerCase());
    return portInfo?.path;
};

main();

async function main() {
    
    usbDetect.startMonitoring();

    usbDetect.on('add', async (device: usbDetect.Device) => await startSerialMonitor(device.serialNumber));
    usbDetect.on('remove', async () => await stopSerialMonitor());
    const devices = await usbDetect.find();

    // hardcoded serial number
    const SERIALNUMBER = '0240000030514E45004520067D7E00471F91000097969900';
    for (const d of devices) {
        if (!d.serialNumber) {
            continue;
        }
        if (d.serialNumber !== SERIALNUMBER) {
            continue;
        }
        await startSerialMonitor(d.serialNumber);
    }

}
