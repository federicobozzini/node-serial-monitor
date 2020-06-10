import SerialPort from 'serialport';
import { TextDecoder } from 'util';

export interface CloseEvent {
    disconnected: boolean,
    message: string,
}

main();

const log = (msg: string) => {
    console.log(msg);
};

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
        log('closing...');
        port.removeAllListeners();
    });
    port.on('error', (error: Error) => {
        log('error!');
        log(error.toString());
        port.removeAllListeners();
    });

    await new Promise<void>((resolve, reject) => {
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
    }).catch((err: Error) => {
        log(err.message);
    });

}
