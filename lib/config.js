import minimist from 'minimist';
import chalk from 'chalk';

const argv = minimist(process.argv.slice(2), {
  string: ['host', 'config'], // Ensure host and config are treated as strings
  alias: { p: 'port' }, // Add alias for port
  boolean: ['debug'] // Add debug flag
});

// Determine HOST
let HOST = 'localhost';
let hostConfigSource = 'default';
if (argv.host) {
    HOST = argv.host;
    hostConfigSource = 'CLI flag (--host)';
} else if (process.env.HOST) {
    HOST = process.env.HOST;
    hostConfigSource = 'environment variable (HOST)';
}

// Determine PORT
let PORT = 3333;
let portConfigSource = 'default';
if (argv.port) {
    const cliPort = parseInt(argv.port, 10);
    if (!isNaN(cliPort)) {
        PORT = cliPort;
        portConfigSource = 'CLI flag (--port)';
    } else {
        console.warn(chalk.yellow(`Invalid --port value "${argv.port}". Using default or environment variable.`));
    }
}

if (portConfigSource === 'default' && process.env.PORT) { // Check env only if CLI port wasn't valid or used
    const envPort = parseInt(process.env.PORT, 10);
    if (!isNaN(envPort)) {
        PORT = envPort;
        portConfigSource = 'environment variable (PORT)';
    } else {
        console.warn(chalk.yellow(`Invalid PORT environment variable "${process.env.PORT}". Using default.`));
    }
}

const BASE_URL = `http://${HOST}:${PORT}`;
const CONFIG_PATH = argv.config || 'wyreup.json'; // Use --config or default
const DEBUG = argv.debug || false;

// Export determined values
export {
    PORT,
    HOST,
    BASE_URL,
    CONFIG_PATH,
    DEBUG,
    argv // Exporting argv as it's used for other flags like --init, --validate, --help, --serve
};