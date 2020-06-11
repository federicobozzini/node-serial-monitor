import * as SerialPort from 'serialport';
import * as usbDetect from 'usb-detection';
import { TextDecoder } from 'util';

export interface CloseEvent {
    disconnected: boolean,
    message: string,
}

const useFix = true;

const log = (msg: string) => {
    console.log(msg);
};

const wait = (t: number): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, t));

let stopRetry = false;

const retry = async <T>(f: () => Promise<T>, times: number, timeout: number): Promise<T> => {
    let i = 0;
    while (i++ < times) {
        if (stopRetry) {
            return Promise.reject();
        }
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

const compareSerialNumbers = (serialNumber1: string, serialNumber2: string) =>
    serialNumber1.toLocaleLowerCase() === serialNumber2.toLocaleLowerCase();

let port: SerialPort | undefined;

const startSerialMonitor = async (serialNumber: string): Promise<void> => {
    stopRetry = false;
    const reconnectionTimeout = useFix ? 2000 : 0;
    await wait(reconnectionTimeout);
    log(`Starting serial monitor for ${serialNumber}`)
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
            process.stdout.write(data);
        });
    });

    port.on('close', (event: CloseEvent) => {
        log(`Connection to ${path} was closed`);
        stopRetry = true;
        port?.removeAllListeners();
        port = undefined;
    });

    port.on('error', (error: Error) => {
        log('error!');
        log(error.toString());
        stopRetry = true;
        port?.removeAllListeners();
        port = undefined;
    });

    const retryConnectTimes = 1000;
    const retryConnectTimeout = 5 * 1000; // 5 second
    const connect = () => new Promise<void>((resolve, reject) => {
        if (port?.isOpen) {
            if (port.path === path) {
                log(`Connection to ${path} was already open`);
                resolve();
                return;
            } else {
                reject(new Error(`Trying to connect to ${path}, but there is already a connection to ${port.path}`));
                return;
            }
        }
        port?.open((error: Error | null | undefined) => {
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
    stopRetry = true;
    if (!port || port.isOpen) {
        return;
    }
    port.close();
};

const getSerialPath = async (serialNumber: string): Promise<string | undefined> => {
    const ports = await SerialPort.list();
    const portInfo = ports.find(p => p.serialNumber && compareSerialNumbers(p.serialNumber, serialNumber));
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
        if (!compareSerialNumbers(d.serialNumber, SERIALNUMBER)) {
            continue;
        }
        await startSerialMonitor(d.serialNumber);
    }

}
