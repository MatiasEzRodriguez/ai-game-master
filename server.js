require('dotenv').config();
const { Pinecone } = require('@pinecone-database/pinecone');
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pc.index('manual-rpg');
const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require("@google/genai"); 
const systemPrompt = require('./systemInstruction');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL_NAME = "gemini-2.5-flash";

// --- FUNCIÓN RAG BLINDADA ---
async function getContext(query) {
    try {
        console.log(`🔍 Intentando buscar contexto para: "${query}"`);

        // INTENTO 1: Sintaxis estándar de la v2.5
        // Si esto falla (is not a function), saltamos al catch sin romper el server
        const result = await ai.models.embedContent({
            model: "text-embedding-004",
            contents: [{ parts: [{ text: query }] }]
        });

        // Manejo flexible de la respuesta del vector
        const queryVector = result.embedding ? result.embedding.values : 
                           (result.embeddings ? result.embeddings[0].values : null);

        if (!queryVector) throw new Error("No se generó vector");

        const queryResponse = await index.query({
            vector: queryVector,
            topK: 3,
            includeMetadata: true
        });

        const textoEncontrado = queryResponse.matches.map(match => match.metadata.text).join("\n\n---\n\n");
        console.log("✅ ¡Conexión con el manual exitosa!");
        return textoEncontrado;

    } catch (error) {
        // AQUÍ ESTÁ LA MAGIA: Si falla el embedding, no rompemos el juego.
        // Simplemente avisamos y dejamos que el GM use su conocimiento base.
        console.warn("⚠️ Aviso: No se pudo leer el manual (Error de librería). Usando reglas base.");
        // console.error(error.message); // Descomentar si querés ver el error técnico
        return ""; 
    }
}

let chatHistory = [
    { role: "user", parts: [{ text: systemPrompt }] }
];

app.post('/chat', async (req, res) => {
    const { message } = req.body;

    try {
        const context = await getContext(message);

        // REGLAS INS/MV
        const reglasINS = `
        [SISTEMA OPERATIVO: IN NOMINE SATANIS / MAGNA VERITAS]
        - Mecánica Principal: D666. Se lanzan 3 dados de 6 caras (Centenas, Decenas, Unidades).
        - Interpretación: Si el resultado es menor o igual a (Atributo + Habilidad), es éxito.
        - Críticos: 111 es Intervención Divina (Éxito masivo/Milagro). 666 es Intervención Infernal (Pifia catastrófica/Caos).
        - Atributos: Fuerza, Agilidad, Percepción, Voluntad, Presencia, Astucia.
        `;

        // Prompt inicial
        const promptConContexto = `
        ${reglasINS}
        CONTEXTO DEL MANUAL: ${context || "Usa reglas estándar."}
        MENSAJE DEL JUGADOR: ${message}

        INSTRUCCIÓN: 
        1. Eres el GM. Narra la situación.
        2. Si la acción requiere una prueba, NO la resuelvas tú. 
        3. Devuelve un objeto JSON con este formato exacto al final de tu respuesta:
           {"tipo": "tirada", "stat": "nombre_atributo", "dificultad": numero_estimado, "razon": "breve explicacion"}
        4. Espera a que el sistema te de los dados.
        `;

        chatHistory.push({ role: "user", parts: [{ text: message }] });

        // 1ª LLAMADA A GEMINI (NARRACIÓN + PETICIÓN DE TIRADA)
        const result = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: [
                ...chatHistory.slice(0, -1),
                { role: "user", parts: [{ text: promptConContexto }] }
            ],
        });

        let text = result.text;
        if (!text && result.candidates) text = result.candidates[0].content.parts[0].text;

        // --- DETECCIÓN DE TIRADA ---
        // Ahora detectamos si el texto incluye la clave del JSON "tipo": "tirada"
        const requiereTirada = text.includes('"tipo": "tirada"');

        if (requiereTirada) {
            console.log("🎲 El GM pide tirada. Procesando D666...");

            // 1. Generamos el D666 real
            const d1 = Math.floor(Math.random() * 6) + 1; // Centenas
            const d2 = Math.floor(Math.random() * 6) + 1; // Decenas
            const d3 = Math.floor(Math.random() * 6) + 1; // Unidades
            
            // En INS/MV, el 666 y el 111 son especiales.
            // Para chequeos normales, se suele comparar el valor, pero dejemos que el GM decida.
            const resultadoDados = `${d1}${d2}${d3}`; 
            const sumaTotal = d1 + d2 + d3; // A veces útil para ver margen de éxito

            // 2. Preparamos el prompt de resolución
            const promptResolucion = `
            [SISTEMA]: Los dados han rodado.
            RESULTADO D666: ${d1}, ${d2}, ${d3} (Valor leído: ${resultadoDados}).
            
            REGLAS DE INTERPRETACIÓN INMEDIATA:
            - Si es 111: INTERVENCIÓN DIVINA (Éxito espectacular, ocurre algo milagroso).
            - Si es 666: INTERVENCIÓN INFERNAL (Desastre absoluto, aparece un demonio o sale todo mal).
            - Si no es crítico: Compara con la dificultad/stat que pediste.
            
            INSTRUCCIÓN:
            Basado en tu petición anterior (${text}) y estos dados, NARRA la resolución final de la acción del jugador.
            ¿Lo logra? ¿Falla? ¿Qué consecuencias tiene?
            `;

            // 3. 2ª LLAMADA A GEMINI (RESOLUCIÓN)
            const narracionFinal = await ai.models.generateContent({
                model: MODEL_NAME,
                contents: [
                    ...chatHistory,
                    { role: "model", parts: [{ text: text }] }, // Lo que el GM dijo antes (el JSON)
                    { role: "user", parts: [{ text: promptResolucion }] } // El resultado de los dados
                ],
            });

            let resolucionTexto = narracionFinal.text;
            if (!resolucionTexto && narracionFinal.candidates) resolucionTexto = narracionFinal.candidates[0].content.parts[0].text;

            // Guardamos en historial
            chatHistory.push({ role: "model", parts: [{ text: resolucionTexto }] });

            // Enviamos al frontend la resolución narrativa Y los dados para mostrar animación si quieres
            res.json({ 
                response: resolucionTexto, 
                dice: [d1, d2, d3],
                rollType: "D666"
            });

        } else {
            // Si no hay tirada, respondemos normal
            chatHistory.push({ role: "model", parts: [{ text: text }] });
            res.json({ response: text });
        }

    } catch (error) {
        console.error("🔥 Error en el servidor:", error);
        res.status(500).json({ error: "Error interno del GM." });
    }
});

app.listen(3000, () => console.log("😈 Servidor INS/MV corriendo en http://localhost:3000"));