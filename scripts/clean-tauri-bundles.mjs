import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const bundleDirs = [
  resolve(repoRoot, 'src-tauri/target/debug/bundle'),
  resolve(repoRoot, 'src-tauri/target/release/bundle'),
];

if (process.platform === 'darwin') {
  try {
    const info = execSync('hdiutil info', { encoding: 'utf8' });
    for (const block of info.split(/\n=+\n/)) {
      const imagePath = block.match(/^image-path\s*:\s*(.+)$/m)?.[1]?.trim();
      if (!imagePath || !imagePath.startsWith(repoRoot)) continue;
      const device = block.match(/^\/dev\/(disk\d+)/m)?.[1];
      if (!device) continue;
      try {
        execSync(`hdiutil detach /dev/${device} -force`, { stdio: 'ignore' });
        console.log(`detached stale bundle DMG /dev/${device} (${imagePath})`);
      } catch {}
    }
  } catch {}
}

for (const dir of bundleDirs) rmSync(dir, { recursive: true, force: true });
