import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

const project = process.env.GCP_PROJECT_ID;
const location = process.env.GCP_LOCATION || 'us-east1';

async function testEmbedding(modelName: string) {
  console.log(`Testing @google/genai vertexai:true for model: "${modelName}"...`);
  const start = Date.now();
  try {
    const ai = new GoogleGenAI({
      vertexai: true,
      project: project,
      location: location,
    });
    
    // In Vertex AI, model names are sometimes passed without 'models/' 
    // or as fully qualified publisher resource paths like:
    // 'publishers/google/models/text-embedding-004'
    const embedResponse = await ai.models.embedContent({
      model: modelName,
      contents: 'Hello embedding from unified SDK on Vertex!',
      config: {
        outputDimensionality: 3072
      }
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
    // Standard names
    'text-embedding-004',
    'text-multilingual-embedding-002',
    
    // Fully qualified Vertex AI model names
    'publishers/google/models/text-embedding-004',
    'publishers/google/models/text-multilingual-embedding-002',
    
    // Auto-updating names
    'text-embedding-005',
    'publishers/google/models/text-embedding-005',
    
    // Flash models if they support embedding (some platforms support it)
    'gemini-2.5-flash',
  ];
  
  for (const m of models) {
    const ok = await testEmbedding(m);
    if (ok) {
      console.log(`\n🎉 Found working Vertex AI embedding configuration: ${m}`);
      process.exit(0);
    }
  }
  process.exit(1);
}

run();
