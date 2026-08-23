#!/usr/bin/env node
/**
 * Runs `firebase emulators:exec` with the JVM flag the Database emulator needs
 * on Windows profiles whose path contains a space.
 *
 * Why this wrapper exists
 * -----------------------
 * Java 21 on Windows builds the internal NIO wakeup pipe over an AF_UNIX
 * socket, and auto-binds it inside the directory Windows reports as the temp
 * dir. When the user profile has a space in it (`C:\Users\Home PC`), Windows
 * hands the JVM the 8.3 short form — `C:\Users\HOMEPC~1\AppData\Local\Temp`.
 * AF_UNIX `bind` accepts a short path and creates the socket file, but AF_UNIX
 * `connect` refuses to resolve one and fails with `EINVAL`. That takes out
 * `Selector.open()`, which takes out Netty, which kills the Database emulator
 * before it binds a port:
 *
 *   IllegalStateException: failed to create a child event loop
 *     -> ChannelException: failed to open a new selector
 *     -> IOException: Unable to establish loopback connection
 *     -> SocketException: Invalid argument: connect
 *
 * `jdk.net.unixdomain.tmpdir` overrides where those implicit binds land. Any
 * long path works — spaces are fine, it is only the `~1` form that breaks — so
 * a repo-local directory is enough and nothing outside the project is touched.
 *
 * Only applied on win32: every other platform has working AF_UNIX and must not
 * have a `C:`-shaped path forced into its environment.
 *
 * Usage:
 *   node scripts/run-emulator-exec.mjs "<command to run under emulators>"
 *   node scripts/run-emulator-exec.mjs        # no command -> emulators:start
 */

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const command = process.argv.slice(2).join(' ');

const env = { ...process.env };

if (process.platform === 'win32') {
  const socketDir = path.join(repoRoot, '.emulator-tmp');
  mkdirSync(socketDir, { recursive: true });

  // Quoted, always. The JVM tokenises JAVA_TOOL_OPTIONS on whitespace, so an
  // unquoted `C:/Users/Home PC/...` arrives as two options and the JVM refuses
  // to start at all ("Unrecognized option"). Double quotes are stripped by
  // HotSpot before the property is set, and are harmless without a space.
  // Forward slashes: the JVM accepts them on Windows and they survive shell
  // quoting far more predictably than backslashes.
  const flag = `-Djdk.net.unixdomain.tmpdir="${socketDir.replace(/\\/g, '/')}"`;

  // Appended, never assigned, so an existing JAVA_TOOL_OPTIONS is preserved.
  env.JAVA_TOOL_OPTIONS = env.JAVA_TOOL_OPTIONS ? `${env.JAVA_TOOL_OPTIONS} ${flag}` : flag;
}

const args = [
  command ? 'emulators:exec' : 'emulators:start',
  '--project',
  'demo-streamflix',
  '--only',
  'auth,database'
];
if (command) args.push(command);

// Spawn the firebase-tools JS entry point with this same Node binary rather
// than going through `npx`. On Windows npx resolves to `npx.cmd`, and Node 24
// refuses to spawn a `.cmd` without a shell (`EINVAL`) — going straight to the
// script sidesteps both that and any shell-quoting of the vitest command.
const firebaseBin = path.join(repoRoot, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');

const child = spawn(process.execPath, [firebaseBin, ...args], {
  stdio: 'inherit',
  env,
  cwd: repoRoot
});

child.on('exit', (code, signal) => {
  // Preserve the emulator's own exit status so CI still fails on a red suite.
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
