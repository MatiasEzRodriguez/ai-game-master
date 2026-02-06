# AI Game Master — Guía rápida

Versión breve y práctica para poner en marcha el proyecto localmente.

## Qué hace
Proyecto mínimo que convierte a un modelo generativo (Gemini) en un Game Master (GM) para partidas INS/MV.
- `server.js` expone un endpoint `/chat` que recibe mensajes de jugadores y responde con narrativa o solicita una tirada (D666).
- `ingest.js` corta `tu_manual.txt` en fragmentos, genera embeddings y los sube a Pinecone (índice `manual-rpg`) para RAG.
- `public/` contiene una UI simple (chat) que consume `/chat`.

## Requisitos
- Node.js (v18+ recomendado)
- Cuenta y claves: Google GenAI (`GEMINI_API_KEY`) y Pinecone (`PINECONE_API_KEY`).

## Instalación rápida
Desde la raíz del proyecto:

```bash
npm install
```

Crear un archivo `.env` con al menos:

```text
GEMINI_API_KEY=tu_api_key_gemini
PINECONE_API_KEY=tu_api_key_pinecone
```

## Indexar el manual (opcional, recomendado para mejor contexto)
1. Asegurate de crear el índice `manual-rpg` en Pinecone con la dimensión correcta según el modelo de embeddings.
2. Ejecutá:

```bash
node ingest.js
```

Esto dividirá `tu_manual.txt` y subirá los vectores a Pinecone.

## Ejecutar el servidor

```bash
node server.js
```

El servidor escucha en `http://localhost:3000` y sirve la UI en `public/`.

## Uso (UI)
Abrí en tu navegador: `http://localhost:3000` y escribí acciones. Si el GM requiere una tirada, el servidor generará un D666 y retornará la narración final junto con los dados.

## Endpoint (para integraciones)
- `POST /chat` — Body: `{ "message": "texto" }`.
  - Respuesta ejemplo (narración): `{ "response": "..." }`
  - Respuesta ejemplo (tirada): `{ "response": "...", "dice": [d1,d2,d3], "rollType": "D666" }`

## Archivos clave
- `server.js` — lógica principal, RAG, llamadas a Gemini y resolución D666.
- `ingest.js` — ingestión de `tu_manual.txt` a Pinecone.
- `systemInstruction.js` — prompt/sistema para el GM.
- `public/` — frontend (index.html, script.js, style.css).
- `tu_manual.txt` — texto fuente para RAG (puede ser grande y con copyright: atención a redistribución).

## Notas rápidas y recomendaciones
- Si no indexás el manual, el GM seguirá funcionando con reglas base (fallback seguro).
- La detección de cuando el GM pide tirada es básica; si querés la hago más robusta para producción.
- No expongas las claves API en público; añadí autenticación/rate-limiting al endpoint antes de publicar.

## Problemas comunes
- Errores de embeddings: comprobar `GEMINI_API_KEY` y versión del SDK.
- Pinecone: confirmar que el índice `manual-rpg` existe y la dimensión coincide con el modelo de embeddings.

---
Si querés, agrego un script `start` en `package.json` y mejoro la extracción del JSON de tirada en `server.js`.