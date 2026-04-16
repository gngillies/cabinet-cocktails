const express = require('express');
const fetch = require('node-fetch');
const zlib = require('zlib');
const app = express();

app.use(express.json({ limit: '20mb' }));

app.use(express.static('public', {
  maxAge: 3600000,
  etag: true,
  lastModified: true,
  setHeaders: function(res, path) {
    if (path.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

// Keep-alive ping
app.post('/ping', (req, res) => res.json({ pong: true }));

// Streaming analysis endpoint
app.post('/analyze', async (req, res) => {
  if (req.body && req.body.ping) return res.json({ pong: true });

  const { imageBase64, imageType } = req.body;

  // Set up SSE stream to browser
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (type, data) => {
    res.write('data: ' + JSON.stringify({ type, data }) + '\n\n');
  };

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3500,
        stream: true,
        system: `You are a world-class master mixologist. Analyze this liquor cabinet image.
Output ONLY a series of JSON lines, one per line, nothing else. Each line is a complete JSON object.
Output them in this exact order and format:

{"type":"bottles","data":["bottle 1","bottle 2"]}
{"type":"cocktail","data":{"name":"Name","tagline":"One evocative sentence","profile":"Boozy & Bold","glassware":"Rocks glass","glasswareIcon":"🥃","pairsWith":["Dark chocolate","Aged cheddar"],"ingredients":["2 oz bourbon","1 large ice cube"],"instructions":"Step by step method.","flavorNote":"Rich flavor description."}}
... (6-10 cocktail lines, best first)
{"type":"mocktail","data":{"name":"Name","tagline":"One sentence","glassware":"Glass","glasswareIcon":"🥂","pairsWith":["food","food"],"ingredients":["ingredient"],"instructions":"Steps.","flavorNote":"Flavor."}}
{"type":"mocktail","data":{"name":"Name","tagline":"One sentence","glassware":"Glass","glasswareIcon":"🥂","pairsWith":["food","food"],"ingredients":["ingredient"],"instructions":"Steps.","flavorNote":"Flavor."}}
{"type":"wildcard","data":{"name":"Creative Name","tagline":"One sentence","profile":"Boozy & Bold","glassware":"Glass","glasswareIcon":"🍸","pairsWith":["food"],"ingredients":["with amounts"],"instructions":"Steps.","flavorNote":"Flavor.","rationale":"Why this works."}}

Rules:
- For "profile", choose the single most accurate descriptor based on the recipe:
  Spirit volume guides strength: 3oz+ total spirit = "Boozy & Bold"; 2-3oz = "Strong & Spirited"; 1-2oz = "Medium & Balanced"; under 1oz or wine/prosecco/beer based = "Light & Effervescent"; no alcohol = "Crisp & Alcohol-Free"
  Override with character if dominant: heavy citrus = "Bright & Citrusy"; cream/coffee/chocolate = "Rich & Indulgent"; Campari/Aperol/amaro heavy = "Bitter & Complex"; tropical = "Tropical & Vibrant"; mezcal/scotch dominant = "Smoky & Intense"; sweet liqueurs dominant = "Sweet & Smooth"; sparkling/champagne = "Light & Effervescent"
  Always derive from actual ingredients — never guess
- Only cocktails makeable from visible bottles (assume ice/water/simple syrup/fresh citrus available)
- ALWAYS include ice in ingredients when needed
- Mocktails: 2 exactly, creative and sophisticated, assume available: citrus, juices, sodas, syrups, garnishes, bitters
- Wildcard: genuinely original creation
- Output each JSON line as soon as it is complete — do not wait
- NO markdown, NO extra text, ONLY the JSON lines`,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: imageType, data: imageBase64 } },
            { type: 'text', text: 'Analyze this liquor cabinet. Output the JSON lines now.' }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      send('error', err.error && err.error.message ? err.error.message : 'API error');
      return res.end();
    }

    // Parse the Anthropic SSE stream and extract text chunks
    let buffer = '';
    
    response.body.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const obj = JSON.parse(data);
          if (obj.type === 'content_block_delta' && obj.delta && obj.delta.text) {
            buffer += obj.delta.text;
            // Try to extract complete JSON lines from buffer
            const nlIdx = buffer.lastIndexOf('\n');
            if (nlIdx !== -1) {
              const complete = buffer.substring(0, nlIdx);
              buffer = buffer.substring(nlIdx + 1);
              // Process each complete line
              complete.split('\n').forEach(jsonLine => {
                jsonLine = jsonLine.trim();
                if (!jsonLine) return;
                try {
                  const parsed = JSON.parse(jsonLine);
                  if (parsed.type && parsed.data) {
                    send(parsed.type, parsed.data);
                  }
                } catch(e) {
                  // Incomplete JSON line - ignore, will be in next chunk
                }
              });
            }
          }
        } catch(e) {}
      }
    });

    response.body.on('end', () => {
      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer.trim());
          if (parsed.type && parsed.data) send(parsed.type, parsed.data);
        } catch(e) {}
      }
      send('done', {});
      res.end();
    });

    response.body.on('error', (err) => {
      send('error', err.message);
      res.end();
    });

  } catch(err) {
    send('error', err.message);
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Running on port', PORT));
