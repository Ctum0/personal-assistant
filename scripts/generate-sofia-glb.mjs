import fs from 'fs';
import path from 'path';

const vrmPath = path.join(process.cwd(), 'public/models/sofia.vrm');
if (fs.existsSync(vrmPath)) {
  const stats = fs.statSync(vrmPath);
  console.log(`✅ Production VRM Digital Human Asset active at: ${vrmPath}`);
  console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
} else {
  console.error(`❌ Model missing at ${vrmPath}`);
}
