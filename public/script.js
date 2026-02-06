// 1. La función auxiliar que hace el efecto de escritura
function typeWriter(text, element, speed = 15) {
    return new Promise((resolve) => {
        let i = 0;
        element.innerHTML = ""; // Limpiamos por si hay algo
        function type() {
            if (i < text.length) {
                element.innerHTML += text.charAt(i);
                i++;
                // Hacemos scroll automático mientras escribe
                const chatBox = document.getElementById('chat-box');
                chatBox.scrollTop = chatBox.scrollHeight;
                setTimeout(type, speed);
            } else {
                resolve(); // Avisamos que terminó
            }
        }
        type();
    });
}

// 2. Tu función principal (la que me pasaste)
async function sendMessage() {
    const input = document.getElementById('user-input');
    const button = document.querySelector('button');
    const chatBox = document.getElementById('chat-box');
    const message = input.value;

    if (!message) return;

    input.value = '';
    input.disabled = true;
    button.disabled = true;

    chatBox.innerHTML += `<div class="msg user"><strong>Vos:</strong> ${message}</div>`;
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });

        const data = await response.json();

        if (data.error) {
            chatBox.innerHTML += `<p style="color:orange"><strong>GM:</strong> Tuve un problema: ${data.error}</p>`;
            return;
        }

        const gmMsgId = "gm-" + Date.now();
        chatBox.innerHTML += `<div class="msg gm"><strong>GM:</strong> <span id="${gmMsgId}"></span></div>`;

        const gmSpan = document.getElementById(gmMsgId);
        
        // Usamos la función que definimos arriba
        await typeWriter(data.response || "El Master guarda silencio...", gmSpan);

        if (data.dice) {
            chatBox.innerHTML += `<div class="dice-roll">🎲 Tirada de dados: <span>${data.dice}</span></div>`;
        }

    } catch (error) {
        chatBox.innerHTML += `<p style="color:red">Error de conexión...</p>`;
    } finally {
        input.disabled = false;
        button.disabled = false;
        input.focus();
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}