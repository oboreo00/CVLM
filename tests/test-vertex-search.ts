import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

const project = process.env.GCP_PROJECT_ID;
const location = process.env.GCP_LOCATION || 'us-central1';

async function testSearch() {
  console.log(`Testing generateContent with googleSearch tool on Vertex...`);
  try {
    const ai = new GoogleGenAI({
      vertexai: true,
      project: project,
      location: location,
    });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Who won the latest super bowl?',
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    console.log(`✅ Success! Response:`, response.text);
    console.log(`Grounding Metadata:`, JSON.stringify(response.candidates?.[0]?.groundingMetadata, null, 2));
  } catch (err: any) {
    console.error(`❌ Failed:`, err);
  }
}

testSearch();
