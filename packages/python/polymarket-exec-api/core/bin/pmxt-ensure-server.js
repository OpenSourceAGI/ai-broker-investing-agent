#!/usr/bin/env node

/**
 * PMXT Server Launcher
 * 
 * This script ensures the PMXT sidecar server is running.
 * It's designed to be called by SDKs in any language (Python, Java, C#, Go, etc.)
 * 
 * Behavior:
 * 1. Check if server is already running (via lock file)
 * 2. If running, exit successfully
 * 3. If not running, spawn the server and wait for health check
 * 4. Exit with code 0 on success, 1 on failure
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const http = require('http');

const LOCK_FILE = path.join(os.homedir(), '.pmxt', 'server.lock');
const DEFAULT_PORT = 3847;
const HEALTH_CHECK_TIMEOUT = 10000; // 10 seconds
const HEALTH_CHECK_INTERVAL = 100; // 100ms

/**
 * Check if the server is currently running
 */
function isServerRunning() {
    try {
        if (!fs.existsSync(LOCK_FILE)) {
            return false;
        }

        const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
        const { pid, port } = lockData;

        // Check if process exists
        try {
            process.kill(pid, 0); // Signal 0 checks existence without killing
            return { running: true, port };
        } catch (err) {
            // Process doesn't exist, remove stale lock file
            fs.unlinkSync(LOCK_FILE);
            return false;
        }
    } catch (err) {
        return false;
    }
}

/**
 * Wait for server to respond to health check
 */
function waitForHealth(port, timeout = HEALTH_CHECK_TIMEOUT) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        const checkHealth = () => {
            const req = http.get(`http://localhost:${port}/health`, (res) => {
                if (res.statusCode === 200) {
                    resolve(true);
                } else {
                    scheduleNextCheck();
                }
            });

            req.on('error', () => {
                scheduleNextCheck();
            });

            req.setTimeout(1000);
        };

        const scheduleNextCheck = () => {
            if (Date.now() - startTime > timeout) {
                reject(new Error('Server health check timeout'));
            } else {
                setTimeout(checkHealth, HEALTH_CHECK_INTERVAL);
            }
        };

        checkHealth();
    });
}

/**
 * Start the PMXT server
 */
async function startServer() {
    // 1. Try to find the server binary/script
    let serverCmd = 'pmxt-server';
    let args = [];

    // Check for Python-bundled server (when bundled in pip package)
    const pythonBundledServer = path.join(__dirname, '..', 'server', 'bundled.js');
    // Check for local dev bundled server
    const localBundledServer = path.join(__dirname, '..', 'dist', 'server', 'bundled.js');
    const localDistServer = path.join(__dirname, '..', 'dist', 'server', 'index.js');
    const localBinServer = path.join(__dirname, 'pmxt-server');

    if (fs.existsSync(pythonBundledServer)) {
        serverCmd = 'node';
        args = [pythonBundledServer];
    } else if (fs.existsSync(localBundledServer)) {
        serverCmd = 'node';
        args = [localBundledServer];
    } else if (fs.existsSync(localDistServer)) {
        serverCmd = 'node';
        args = [localDistServer];
    } else if (fs.existsSync(localBinServer)) {
        serverCmd = localBinServer;
    }

    // Spawn server as detached process
    const serverProcess = spawn(serverCmd, args, {
        detached: true,
        stdio: 'ignore',
        env: process.env
    });

    // Detach from parent process
    serverProcess.unref();

    // Wait for server to be ready
    await waitForHealth(DEFAULT_PORT);
}

/**
 * Main entry point
 */
async function main() {
    try {
        // Check if server is already running
        const serverStatus = isServerRunning();

        if (serverStatus && serverStatus.running) {
            // Server is running, verify it's healthy
            try {
                await waitForHealth(serverStatus.port, 2000);
                process.exit(0);
            } catch (err) {
                // Server process exists but not responding, try to start fresh
                console.error('Server process exists but not responding, starting fresh...');
            }
        }

        // Start the server
        await startServer();
        process.exit(0);
    } catch (err) {
        console.error('Failed to ensure server is running:', err.message);
        process.exit(1);
    }
}

main();
