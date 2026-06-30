export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const keys = Object.keys(process.env);
  const dbKeys = keys.filter(k => 
    k.includes('DB') || 
    k.includes('DATABASE') || 
    k.includes('POSTGRES') || 
    k.includes('PASSWORD') ||
    k.includes('URL') ||
    k.includes('SECRET') ||
    k.includes('KEY')
  );

  const envValues = {};
  for (const k of dbKeys) {
    // Obfuscate secret values slightly but show formats or first/last chars
    const val = process.env[k] || '';
    if (val.length > 8) {
      envValues[k] = `${val.substring(0, 4)}...${val.substring(val.length - 4)} (length: ${val.length})`;
    } else {
      envValues[k] = val;
    }
  }

  return res.status(200).json({ 
    success: true, 
    all_keys: keys,
    matched_env: envValues
  });
}
