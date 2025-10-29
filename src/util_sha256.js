export async function sha256(s) {
  const data = new TextEncoder().encode(s);
  const dig = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(dig)].map(b=>b.toString(16).padStart(2,'0')).join('');
  return hex;
}
