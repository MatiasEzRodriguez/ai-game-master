const { GoogleGenerativeAI } = require("@google/generative-ai");
const { character, rollDice, calculateMod } = require('./gameLogic');

const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: systemPrompt 
});

// Aquí guardaremos la historia de la partida
let chatHistory = [];

async function gameLoop(userInput) {
    const chat = model.startChat({ history: chatHistory });

    // 1. Enviamos la acción del usuario a la IA
    const result = await chat.sendMessage(userInput);
    const responseText = result.response.text();

    // 2. ¿La IA nos pidió una tirada? (Chequeo de JSON)
    if (responseText.includes("{")) {
        try {
            const intent = JSON.parse(responseText);
            if (intent.tipo === "tirada") {
                const dado = rollDice(20);
                const mod = calculateMod(character.stats[intent.stat]);
                const total = dado + mod;
                const exito = total >= intent.dificultad;

                // 3. Le devolvemos el resultado a la IA para que lo narre
                const narracion = await chat.sendMessage(
                    `Resultado: saqué un ${dado} + ${mod} = ${total}. 
                     Dificultad era ${intent.dificultad}. 
                     Fue un ${exito ? "ÉXITO" : "FRACASO"}. Narrá qué pasa.`
                );
                
                console.log("GM:", narracion.response.text());
            }
        } catch (e) {
            // Si no era JSON válido, simplemente imprimimos
            console.log("GM:", responseText);
        }
    } else {
        console.log("GM:", responseText);
    }

    // Actualizamos el historial para la próxima vuelta
    chatHistory = await chat.getHistory();
}

// Ejemplo de uso:
gameLoop("Intento forzar la cerradura del cofre con mis herramientas");