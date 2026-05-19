import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

const project = process.env.GCP_PROJECT_ID;
const location = process.env.GCP_LOCATION || 'us-east1';

async function testSearch() {
  console.log(`Testing generateContent with googleSearch tool on Vertex...`);
  const start = Date.now();
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

    const duration = Date.now() - start;
    console.log(`✅ Success! (${duration}ms) Response:`, response.text);
    console.log(`Grounding Metadata:`, JSON.stringify(response.candidates?.[0]?.groundingMetadata, null, 2));
  } catch (err: any) {
    const duration = Date.now() - start;
    console.error(`❌ Failed after ${duration}ms:`, err);
  }
}

testSearch();
