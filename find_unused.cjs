const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function findExports() {
  const cmd = 'grep -rE "^export (const|function|class) [A-Za-z0-9_]+" . --include="*.ts" --include="*.tsx" --exclude-dir="node_modules" --exclude-dir=".next" --exclude-dir="dist"';
  try {
    const output = execSync(cmd, { encoding: 'utf-8' });
    const lines = output.split('\n').filter(Boolean);
    const exports = [];
    for (const line of lines) {
      const match = line.match(/^\.\/(.*?):export (?:const|function|class) ([A-Za-z0-9_]+)/);
      if (match) {
        exports.push({ file: match[1], name: match[2] });
      }
    }
    return exports;
  } catch (e) {
    return [];
  }
}

const exportsList = findExports();
const unused = [];

for (const exp of exportsList) {
  const cmd = `grep -rw "${exp.name}" . --include="*.ts" --include="*.tsx" --exclude-dir="node_modules" --exclude-dir=".next" --exclude-dir="dist"`;
  try {
    const output = execSync(cmd, { encoding: 'utf-8' });
    const lines = output.split('\n').filter(Boolean);
    const otherFiles = lines.filter(l => !l.startsWith('./' + exp.file) && !l.startsWith(exp.file));
    if (otherFiles.length === 0) {
      unused.push(exp);
    }
  } catch (e) {
    unused.push(exp);
  }
}

console.log(JSON.stringify(unused, null, 2));
