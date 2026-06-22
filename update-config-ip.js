const fs = require('fs');
const path = require('path');
const os = require('os');

// Detect local IPv4 address
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  
  // Phase 1: Search for Wi-Fi/Wireless interfaces
  for (const name of Object.keys(interfaces)) {
    const nameLower = name.toLowerCase();
    const isWifi = nameLower.includes('wi-fi') || nameLower.includes('wifi') || nameLower.includes('wlan');
    const isVirtual = nameLower.includes('virtualbox') || nameLower.includes('vbox') || nameLower.includes('vmware') || nameLower.includes('host-only');
    
    if (isWifi && !isVirtual) {
      for (const net of interfaces[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  }

  // Phase 2: Search for Ethernet interfaces
  for (const name of Object.keys(interfaces)) {
    const nameLower = name.toLowerCase();
    const isEthernet = nameLower.includes('ethernet') || nameLower.includes('eth');
    const isVirtual = nameLower.includes('virtualbox') || nameLower.includes('vbox') || nameLower.includes('vmware') || nameLower.includes('host-only');

    if (isEthernet && !isVirtual) {
      for (const net of interfaces[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  }

  // Phase 3: Fallback to any external IPv4 address
  for (const name of Object.keys(interfaces)) {
    const nameLower = name.toLowerCase();
    const isVirtual = nameLower.includes('virtualbox') || nameLower.includes('vbox') || nameLower.includes('vmware') || nameLower.includes('host-only');

    if (!isVirtual) {
      for (const net of interfaces[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  }

  return '127.0.0.1';
}

// Update environment file helper
function updateEnvFile(filePath, updates) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[IP Config] File not found: ${filePath}`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let lines = content.split(/\r?\n/);
  const updatedKeys = new Set();

  lines = lines.map(line => {
    // Check if line matches key=value
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      if (updates.hasOwnProperty(key)) {
        updatedKeys.add(key);
        return `${key}=${updates[key]}`;
      }
    }
    return line;
  });

  // Append any keys that weren't found in the existing file
  for (const key of Object.keys(updates)) {
    if (!updatedKeys.has(key)) {
      lines.push(`${key}=${updates[key]}`);
    }
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  console.log(`[IP Config] Updated ${path.basename(filePath)} successfully.`);
}

function main() {
  const ip = getLocalIpAddress();
  console.log(`[IP Config] Detected local network IP address: ${ip}`);

  const rootDir = __dirname;
  const serverEnvPath = path.join(rootDir, 'server', '.env');
  const clientEnvPath = path.join(rootDir, 'client', '.env');

  // Update server/.env
  updateEnvFile(serverEnvPath, {
    'ANNOUNCED_IP': ip,
    'FRONTEND_URL': `https://${ip}:3000`
  });

  // Update client/.env
  updateEnvFile(clientEnvPath, {
    'ALLOWED_ORIGINS': `https://${ip}:3001`,
    'ALLOWED_DEV_ORIGINS': `localhost:3000,${ip}:3000,localhost,${ip}`
  });
}

main();
