/**
 * Local preview development server for A* - the homework destroyer
 * Includes built-in API proxy for Gemini to bypass any browser CORS / network restrictions
 * Run with: node server.js
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pdf': 'application/pdf'
};

function clearSavedApiKeyFolder() {
  const targetDir = path.join(__dirname, 'saved API key');
  if (fs.existsSync(targetDir)) {
    try {
      const items = fs.readdirSync(targetDir);
      for (const item of items) {
        const fp = path.join(targetDir, item);
        try {
          fs.rmSync(fp, { recursive: true, force: true });
        } catch (e) {
          try { fs.unlinkSync(fp); } catch (e2) {}
        }
      }
      console.log(`[Storage] Cleared all items in: saved API key`);
      return true;
    } catch (err) {
      console.error(`[Storage] Error clearing saved API key folder:`, err.message);
      return false;
    }
  }
  return false;
}

function forwardToGoogle(model, apiKey, payload, apiVersion, callback) {
  if (typeof apiVersion === 'function') {
    callback = apiVersion;
    apiVersion = 'v1beta';
  }
  const cleanKey = (apiKey || '').trim().replace(/^['"\s]+|['"\s]+$/g, '');
  const cleanModel = model.replace(/^models\//, '');
  const ver = apiVersion || 'v1beta';
  const targetUrl = `https://generativelanguage.googleapis.com/${ver}/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(cleanKey)}`;

  const postData = JSON.stringify(payload);
  console.log(`[API Proxy] ➔ Requesting Google [${ver}] model: ${cleanModel} (bytes: ${Buffer.byteLength(postData)})`);

  const request = https.request(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  }, (apiRes) => {
    let data = '';
    apiRes.on('data', c => data += c);
    apiRes.on('end', () => {
      console.log(`[API Proxy] 🠔 Google responded with status ${apiRes.statusCode} for [${ver}] ${cleanModel}`);
      if (apiRes.statusCode !== 200) {
        console.log(`[API Proxy] Response body:`, data);
      }

      // If 404 on v1beta, try v1 before giving up on this model
      if (apiRes.statusCode === 404 && ver === 'v1beta') {
        console.log(`[API Proxy] 404 on v1beta for ${cleanModel}, retrying on v1...`);
        // If payload has systemInstruction, move it to contents for v1 compatibility
        let v1Payload = payload;
        if (payload.systemInstruction && payload.systemInstruction.parts) {
          const sysText = payload.systemInstruction.parts[0]?.text || '';
          v1Payload = JSON.parse(JSON.stringify(payload));
          delete v1Payload.systemInstruction;
          if (v1Payload.contents && v1Payload.contents[0] && v1Payload.contents[0].parts) {
            v1Payload.contents[0].parts[0].text = sysText + '\n\n' + v1Payload.contents[0].parts[0].text;
          }
        }
        forwardToGoogle(cleanModel, cleanKey, v1Payload, 'v1', callback);
        return;
      }

      callback(null, apiRes.statusCode, data);
    });
  });

  request.on('error', (e) => {
    console.error(`[API Proxy] Network error for model ${cleanModel}:`, e.message);
    callback(e, 500, null);
  });

  request.write(postData);
  request.end();
}

function getAvailableModels(apiKey, callback) {
  const cleanKey = (apiKey || '').trim().replace(/^['"\s]+|['"\s]+$/g, '');
  const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`;
  https.get(targetUrl, (apiRes) => {
    let data = '';
    apiRes.on('data', c => data += c);
    apiRes.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.models && Array.isArray(parsed.models)) {
          const valid = parsed.models
            .filter(m => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
            .map(m => m.name.replace(/^models\//, ''));
          console.log(`[API Proxy] Discovered ${valid.length} available models for this key:`, valid);
          callback(null, valid);
          return;
        }
      } catch (e) {}
      callback(null, []);
    });
  }).on('error', (err) => {
    console.warn('[API Proxy] Failed to list models:', err.message);
    callback(err, []);
  });
}

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Handle API Key Validation Endpoint
  if (req.url.startsWith('/api/validate-key') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { apiKey } = JSON.parse(body);
        const cleanKey = (apiKey || '').trim().replace(/^['"\s]+|['"\s]+$/g, '');
        if (!cleanKey) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing API key' }));
          return;
        }

        const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`;
        https.get(targetUrl, (apiRes) => {
          let data = '';
          apiRes.on('data', c => data += c);
          apiRes.on('end', () => {
            console.log(`[API Proxy] Key validation status: ${apiRes.statusCode}`);
            res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
            res.end(data);
          });
        }).on('error', (e) => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        });
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON request' }));
      }
    });
    return;
  }

  // Handle Gemini Generation Proxy with Multi-Model Fallback
  if (req.url.startsWith('/api/gemini') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { apiKey, model, payload } = JSON.parse(body);
        const cleanKey = (apiKey || '').trim().replace(/^['"\s]+|['"\s]+$/g, '');

        let requestedModel = (model || '').trim().replace(/^models\//, '');
        if (requestedModel === 'Gemini 3.5 Flash Lite' || requestedModel === 'gemini-3.5-flash-lite') {
          requestedModel = 'gemini-3.5-flash-lite';
        } else if (requestedModel === 'Gemini 3.8 Flash' || requestedModel === 'gemini-3.8-flash') {
          requestedModel = 'gemini-3.8-flash';
        }

        getAvailableModels(cleanKey, (listErr, onlineModels) => {
          // Filter onlineModels to prefer text models (exclude non-text/specialized preview models)
          const validOnlineModels = (onlineModels || []).filter(m => 
            !m.includes('-tts') && 
            !m.includes('image') && 
            !m.includes('clip') && 
            !m.includes('robotics') &&
            !m.includes('computer-use')
          );

          // Group so flash-lite and flash models come first
          const flashLiteModels = validOnlineModels.filter(m => m.includes('flash-lite'));
          const flashModels = validOnlineModels.filter(m => m.includes('flash') && !m.includes('flash-lite'));
          const otherModels = validOnlineModels.filter(m => !m.includes('flash'));

          const candidateList = [
            requestedModel,
            'gemini-3.5-flash-lite',
            'gemini-flash-lite-latest',
            'gemini-3.1-flash-lite',
            ...flashLiteModels,
            'gemini-3.8-flash',
            'gemini-3.5-flash',
            'gemini-flash-latest',
            ...flashModels,
            ...otherModels
          ].filter(Boolean);

          // Deduplicate while preserving order
          const candidates = [...new Set(candidateList)];
          console.log(`[API Proxy] Model priority order:`, candidates);

          let idx = 0;
          let lastStatusCode = 500;
          let lastResponseData = null;

          function tryNextModel() {
            if (idx >= candidates.length) {
              res.writeHead(lastStatusCode || 500, { 'Content-Type': 'application/json' });
              if (lastResponseData) {
                res.end(lastResponseData);
              } else {
                res.end(JSON.stringify({ error: 'All Gemini model candidates failed to generate content.' }));
              }
              return;
            }

            const currentModel = candidates[idx++];
            forwardToGoogle(currentModel, cleanKey, payload, 'v1beta', (err, statusCode, data) => {
              if (err) {
                tryNextModel();
                return;
              }

              lastStatusCode = statusCode;
              lastResponseData = data;

              if (statusCode === 200) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(data);
              } else if (statusCode === 400 || statusCode === 401 || statusCode === 403) {
                // Check if invalid API key
                if (
                  data && (
                    data.includes('API_KEY_INVALID') || 
                    data.includes('API key not valid') || 
                    data.includes('key not valid') ||
                    data.includes('consumer')
                  )
                ) {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(data);
                  return;
                }
                // Model not found or model-specific argument error, try next candidate
                console.log(`[API Proxy] Model ${currentModel} returned ${statusCode}, falling back to next...`);
                tryNextModel();
              } else if (statusCode === 404 || statusCode === 429 || statusCode === 503) {
                console.log(`[API Proxy] Model ${currentModel} returned ${statusCode}, falling back to next...`);
                tryNextModel();
              } else {
                res.writeHead(statusCode, { 'Content-Type': 'application/json' });
                res.end(data);
              }
            });
          }

          tryNextModel();
        });

      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON request: ' + err.message }));
      }
    });
    return;
  }

  // Handle Save Local File (uploaded files, outputted files, saved API key)
  if (req.url.startsWith('/api/save-local') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { category, fileName, contentBase64, text } = JSON.parse(body);
        let folderName = 'uploaded files';
        if (category === 'outputted') folderName = 'outputted files';
        else if (category === 'api_key') folderName = 'saved API key';

        const targetDir = path.join(__dirname, folderName);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        if (category === 'api_key') {
          // Save API key into saved API key folder
          const keysFile = path.join(targetDir, 'api_keys.json');
          let keysList = [];
          if (fs.existsSync(keysFile)) {
            try { keysList = JSON.parse(fs.readFileSync(keysFile, 'utf8')); } catch (e) {}
          }
          const cleanKey = (text || '').trim();
          if (cleanKey && !keysList.find(k => k.key === cleanKey)) {
            keysList.push({
              key: cleanKey,
              masked: cleanKey.slice(0, 4) + '...' + cleanKey.slice(-4),
              name: fileName || ('key_' + (keysList.length + 1)),
              date: new Date().toLocaleString()
            });
            fs.writeFileSync(keysFile, JSON.stringify(keysList, null, 2), 'utf8');
          }
          // Also save as plain text
          fs.writeFileSync(path.join(targetDir, 'api_key.txt'), cleanKey, 'utf8');
          console.log(`[Storage] Saved locally: ${folderName}/api_key.txt`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, folder: folderName }));
          return;
        }

        // For binary files (docx, pdf)
        const safeName = path.basename(fileName || 'file');
        const targetPath = path.join(targetDir, safeName);
        if (contentBase64) {
          const buffer = Buffer.from(contentBase64, 'base64');
          fs.writeFileSync(targetPath, buffer);
          console.log(`[Storage] Saved locally: ${folderName}/${safeName} (${buffer.length} bytes)`);
        } else if (text) {
          fs.writeFileSync(targetPath, text, 'utf8');
          console.log(`[Storage] Saved locally: ${folderName}/${safeName}`);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, folder: folderName, file: safeName }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Handle Delete Local File or Folder Contents / Clear API Keys
  if ((req.url.startsWith('/api/delete-local') || req.url.startsWith('/api/clear-api-keys')) && (req.method === 'POST' || req.method === 'GET')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        let category = '';
        let fileName = '';

        try {
          const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
          category = parsedUrl.searchParams.get('category') || '';
          fileName = parsedUrl.searchParams.get('fileName') || '';
        } catch (e) {}

        if (body) {
          try {
            const parsed = JSON.parse(body);
            if (parsed.category) category = parsed.category;
            if (parsed.fileName) fileName = parsed.fileName;
          } catch (e) {
            if (body.includes('api_key')) category = 'api_key';
          }
        }

        // If requested to clear api keys (e.g., when index.html is closed)
        if (req.url.startsWith('/api/clear-api-keys') || category === 'api_key' || category === 'api_keys') {
          clearSavedApiKeyFolder();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, cleared: 'saved API key' }));
          return;
        }

        let folderName = 'uploaded files';
        if (category === 'outputted') folderName = 'outputted files';

        const targetDir = path.join(__dirname, folderName);
        if (fs.existsSync(targetDir)) {
          if (fileName === 'all' || !fileName) {
            // Delete all files inside the folder
            const files = fs.readdirSync(targetDir);
            for (const f of files) {
              const fp = path.join(targetDir, f);
              try { fs.rmSync(fp, { recursive: true, force: true }); } catch (e) {
                if (fs.statSync(fp).isFile()) fs.unlinkSync(fp);
              }
            }
            console.log(`[Storage] Cleared all local files in: ${folderName}`);
          } else {
            const safeName = path.basename(fileName);
            const fp = path.join(targetDir, safeName);
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
            console.log(`[Storage] Deleted: ${folderName}/${safeName}`);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Static File Serving
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') reqPath = '/Index.html';

  const filePath = path.join(__dirname, reqPath);

  // Security check: ensure path stays inside root directory
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access denied');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found: ' + reqPath);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 A* - the homework destroyer is running at:`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});

// Clean up "saved API key" folder on process termination
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down: cleaning all items in "saved API key" folder...');
  clearSavedApiKeyFolder();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Server] Terminating: cleaning all items in "saved API key" folder...');
  clearSavedApiKeyFolder();
  process.exit(0);
});
