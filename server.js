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
- mocktails: create EXACTLY 2 creative, sophisticated alcohol-free drinks inspired by the spirits and flavor profiles visible in the cabinet. Assume ALL of the following are available: fresh citrus (lemon, lime, orange, grapefruit), fruit juices (cranberry, pineapple, apple, pomegranate, grapefruit), sodas (club soda, ginger beer, ginger ale, tonic water, cola, lemon-lime soda), syrups (simple syrup, grenadine, honey syrup, orgeat, mint syrup, lavender syrup), garnishes (cocktail cherries, olives, citrus twists, fresh mint, rosemary, cucumber slices, orange slices), and pantry items (angostura bitters, orange bitters, coconut cream, heavy cream, egg whites, salt, sugar, dried spices). Make them genuinely interesting and bartender-quality — mirror the complexity and mood of the cocktails in the list. Name them creatively
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
