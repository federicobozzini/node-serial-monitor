import SerialPort from 'serialport';
import { TextDecoder } from 'util';

export interface CloseEvent {
    disconnected: boolean,
    message: string,
}

const log = (msg: string) => {
    console.log(msg);
};

const retry = async <T>(f: () => Promise<T>, times: number, timeout: number): Promise<T> => {
    const wait = async (t: number) => new Promise<void>(resolve => setTimeout(resolve, t));
    let i = 0;
    while (i++ < times) {
        try {
            const res = await f();
            console.log('ok');
            return res;
        } catch (e) {
            log(`Error: ${e.message}`);
        }
        await wait(timeout);
    }
    return Promise.reject();
}

main();

async function main() {

    const options: SerialPort.OpenOptions = {
        baudRate: 9600,
        autoOpen: false,
    };

    const path = 'COM5';
    const port = new SerialPort(path, options)

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

    const times = 1000;
    const timeout = 5 * 1000; // 5 second
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

    await retry(() => connect(), times, timeout)
        .then(() => {
            log(`Connection to ${path} was successful`);
        })
        .catch((err: Error) => {
            log(`Failed to connect to serial port ${path}`);
        });

}
