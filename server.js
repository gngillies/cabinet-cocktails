const express = require('express');
const fetch = require('node-fetch');
const zlib = require('zlib');
const app = express();

// Gzip compression middleware - reduces HTML/JSON by 60-70% over mobile networks
app.use(function(req, res, next) {
  const ae = req.headers['accept-encoding'] || '';
  if (!ae.includes('gzip')) return next();
  const _json = res.json.bind(res);
  res.json = function(obj) {
    const body = JSON.stringify(obj);
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Content-Type', 'application/json');
    zlib.gzip(Buffer.from(body), function(err, buf) {
      if (err) { res.setHeader('Content-Encoding', 'identity'); return _json(obj); }
      res.setHeader('Content-Length', buf.length);
      res.end(buf);
    });
    return res;
  };
  next();
});

app.use(express.json({ limit: '20mb' }));

// Static files with 1-hour cache headers
app.use(express.static('public', {
  maxAge: 3600000,
  etag: true,
  lastModified: true,
  setHeaders: function(res, path) {
    // HTML should revalidate - everything else can cache
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

app.post('/analyze', async (req, res) => {
  // Keep-alive ping - no API call, just confirms server is awake
  if (req.body && req.body.ping) {
    return res.json({ pong: true });
  }

  try {
    const { imageBase64, imageType } = req.body;
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
        system: `You are a world-class master mixologist and flavor scientist. Analyze the provided image of a liquor cabinet or bar shelf.
Return ONLY valid JSON, no other text:
{
  "bottles": ["every identified bottle"],
  "cocktails": [{"name":"Cocktail Name","tagline":"One evocative atmospheric sentence capturing the mood and occasion","abv":"e.g. ~28% ABV","glassware":"specific glass e.g. Rocks glass, Coupe, Martini glass, Highball","glasswareIcon":"single emoji representing the glass","pairsWith":["2-3 specific food pairings e.g. Dark chocolate, Aged cheddar, Charcuterie"],"ingredients":["2 oz bourbon","1 large ice cube","orange peel to garnish"],"instructions":"Clear step-by-step in 2-3 sentences. Be specific about technique.","flavorNote":"Rich 2-3 sentence flavor narrative with specific notes like dried cherry, toasted oak, bitter citrus pith, candied ginger."}],
  "mocktails": [{"name":"Mocktail Name","tagline":"One evocative sentence","glassware":"specific glass","glasswareIcon":"single emoji","pairsWith":["2-3 food pairings"],"ingredients":["ingredient with amount"],"instructions":"Clear step-by-step in 2-3 sentences.","flavorNote":"Rich 2-3 sentence flavor description."}],
  "wildcard": {"name":"Original Creative Name","tagline":"One evocative sentence","abv":"estimated ABV","glassware":"specific glass","glasswareIcon":"single emoji","pairsWith":["2-3 food pairings"],"ingredients":["with amounts"],"instructions":"Steps.","flavorNote":"Rich 2-3 sentence flavor description.","rationale":"Creative concept and why these ingredients work together."}
}
Rules:
- cocktails: only makeable from visible bottles (assume ice/water/simple syrup/fresh citrus available); ALWAYS include ice when needed; sort best first; 6-10 cocktails; wildcard must be genuinely original
- mocktails: create EXACTLY 2 creative, sophisticated alcohol-free drinks. Assume available: fresh citrus, fruit juices, sodas (club soda, ginger beer, tonic water), syrups (simple syrup, grenadine, honey syrup, orgeat), garnishes (cocktail cherries, citrus twists, fresh mint, rosemary, cucumber), bitters, coconut cream, egg whites. Make them bartender-quality and creative.
Return ONLY the JSON.`,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: imageType, data: imageBase64 } },
            { type: 'text', text: 'Analyze this liquor cabinet.' }
          ]
        }]
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data.error?.message || 'API error' });
    const text = (data.content||[]).map(b=>b.text||'').join('').replace(/```json|```/g,'').trim();
    res.json(JSON.parse(text));
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Running on port', PORT));
