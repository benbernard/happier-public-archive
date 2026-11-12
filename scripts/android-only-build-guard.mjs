const target = String(process.argv[2] ?? 'this build').trim() || 'this build';
// The Android client needs the fork's daemon and relay for HTTP MCP OAuth.
if (['cli-build', 'server-build', 'server-build-runtime'].includes(target)) process.exit(0);

const message = `[android-only] ${target} is disabled in this fork; only Android phone and supporting backend builds are enabled.`;

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ok: false, error: message }));
} else {
  console.error(message);
}

process.exit(1);
