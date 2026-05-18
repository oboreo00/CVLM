import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

const project = process.env.GCP_PROJECT_ID;
const location = process.env.GCP_LOCATION || 'us-central1';

async function testGenerate(modelName: string) {
  console.log(`Testing generateContent via unified SDK on Vertex for model: "${modelName}"...`);
  try {
    const ai = new GoogleGenAI({
      vertexai: true,
      project: project,
      location: location,
    });

    const response = await ai.models.generateContent({
      model: modelName,
      contents: 'Hello! How are you doing? Tell me in 5 words.',
    });

    console.log(`✅ Success for "${modelName}"! Response:`, response.text);
    return true;
  } catch (err: any) {
    console.error(`❌ Failed for "${modelName}":`, err.message);
    return false;
  }
}

async function run() {
  const models = [
    'gemini-2.5-flash',
    'gemini-1.5-flash',
    'gemini-2.5-pro',
    'gemini-1.5-pro',
  ];

  for (const m of models) {
    await testGenerate(m);
  }
}

run();
