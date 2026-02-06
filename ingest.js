require('dotenv').config();
const fs = require('fs');
const { Pinecone } = require('@pinecone-database/pinecone');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { RecursiveCharacterTextSplitter } = require('@langchain/textsplitters');

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

async function ingest() {
    try {
        console.log("📖 Leyendo manual.txt...");
        // Leemos el archivo que generaste con Google Docs
        const text = fs.readFileSync('tu_manual.txt', 'utf-8');

        if (text.length < 10) {
            throw new Error("El archivo manual.txt parece estar vacío.");
        }

        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });

        // Con .splitText() para strings planos
        const chunks = await splitter.splitText(text);
        console.log(`✂️ Manual dividido en ${chunks.length} fragmentos.`);

        const index = pc.index('manual-rpg');

        console.log("🚀 Subiendo fragmentos a Pinecone...");
        for (let i = 0; i < chunks.length; i++) {
            const content = chunks[i];
            
            const result = await embeddingModel.embedContent(content);
            const vector = result.embedding.values;

            await index.upsert([{
                id: `chunk-${i}`,
                values: vector,
                metadata: { text: content }
            }]);

            if (i % 10 === 0) console.log(`⏳ Cargados ${i}/${chunks.length}...`);
        }

        console.log("✅ ¡Proceso terminado con éxito!");

    } catch (error) {
        console.error("❌ Error:", error.message);
    }
}

ingest();