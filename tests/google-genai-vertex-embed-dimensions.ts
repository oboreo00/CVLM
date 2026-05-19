import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

const project = process.env.GCP_PROJECT_ID;
const location = process.env.GCP_LOCATION || 'us-east1';

async function testEmbedding(modelName: string, outputDim?: number) {
  console.log(`Testing @google/genai vertexai:true for model: "${modelName}" with dim: ${outputDim}...`);
  const start = Date.now();
  try {
    const ai = new GoogleGenAI({
      vertexai: true,
      project: project,
      location: location,
    });
    
    const config: any = {};
    if (outputDim) {
      config.outputDimensionality = outputDim;
    }
    
    const embedResponse = await ai.models.embedContent({
      model: modelName,
      contents: 'Hello embedding from unified SDK on Vertex!',
      config
    });
    
    const duration = Date.now() - start;
    console.log(`✅ Success for "${modelName}"! (${duration}ms) Dimension length:`, embedResponse.embeddings?.[0]?.values?.length);
    return true;
  } catch (err: any) {
    const duration = Date.now() - start;
    console.error(`❌ Failed for "${modelName}" after ${duration}ms:`, err.message);
    return false;
  }
}

async function run() {
  const models = [
    { name: 'text-embedding-004', dim: undefined },
    { name: 'text-embedding-004', dim: 768 },
    { name: 'text-multilingual-embedding-002', dim: undefined },
    { name: 'text-embedding-005', dim: undefined },
  ];
  
  for (const m of models) {
    await testEmbedding(m.name, m.dim);
  }
}

run();
