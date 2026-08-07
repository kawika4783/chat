function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createClientId(cryptoApi = globalThis.crypto) {
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID().replaceAll('-', '');
  }

  if (typeof cryptoApi?.getRandomValues === 'function') {
    return bytesToHex(cryptoApi.getRandomValues(new Uint8Array(16)));
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}
