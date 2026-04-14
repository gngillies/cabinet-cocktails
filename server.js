const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));

app.post('/analyze', async (req, res) => {
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
        max_tokens: 2000,
        system: `You are a world-class master mixologist and flavor scientist. Analyze the provided image of a liquor cabinet or bar shelf.
Return ONLY valid JSON, no other text:
{"bottles":["every identified bottle"],"cocktails":[{"name":"Cocktail Name","tagline":"One evocative sentence","score":92,"ingredients":["2 oz X","1 oz Y"],"instructions":"Clear step-by-step in 2-3 sentences.","flavorNote":"Flavor profile."}],"wildcard":{"name":"Original Name","tagline":"One sentence","ingredients":["amount item"],"instructions":"Steps.","flavorNote":"Why these flavors work together scientifically.","rationale":"Creative concept."}}
Rules: only cocktails makeable from visible bottles (assume ice/water/basic syrups/juices); score 1-100; sort descending; 6-10 cocktails; wildcard must be genuinely original. Return ONLY the JSON.`,
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
