const fs = require('fs');
const path = require('path');
function rmdir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    if (fs.statSync(fp).isDirectory()) rmdir(fp);
    else fs.unlinkSync(fp);
  }
  fs.rmdirSync(dir);
}
rmdir(path.join(__dirname, 'apps/web/.next'));
console.log('cleared .next');
