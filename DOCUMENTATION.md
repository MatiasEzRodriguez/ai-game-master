# Documentación técnica — AI Game Master

Esta documentación describe en detalle la arquitectura, el flujo, las dependencias y la implementación técnica del proyecto "AI Game Master" que se encuentra en este repositorio. Incluye explicación de los componentes backend, frontend, proceso de ingestión (RAG), variables de entorno necesarias, endpoints, formato de mensajes, manejo de tiradas (D666) y recomendaciones de despliegue.

**Índice**
- Visión general
- Estructura de archivos y propósito
- Dependencias y requerimientos
- Variables de entorno necesarias
- Flujo de ejecución (end-to-end)
- Detalle técnico por archivo
  - `server.js`
  - `ingest.js`
  - `gameLogic.js`
  - `index.js`
  - `systemInstruction.js`
  - `tu_manual.txt`
  - `public/index.html`, `public/script.js`, `public/style.css`
  - `package.json`
- Esquema RAG (retrieval-augmented generation)
- Formato de interacción y contrato API
- Manejo de tiradas D666
- Errores, tolerancia a fallos y seguridad
- Pasos para ejecutar localmente
- Ingestión del manual a Pinecone
- Extensiones y puntos de mejora
- Notas sobre compatibilidades y riesgos


**Visión general**

El proyecto implementa un "Game Master" (GM) asistido por modelos de lenguaje de Google (Gemini) que combina:
- Un servidor Express que orquesta la interacción entre jugadores y la IA (`server.js`).
- Un mecanismo RAG mediante embeddings y Pinecone para buscar contexto en un manual largo (`ingest.js` y `tu_manual.txt`).
- Un frontend simple en `public/` para chat y visualización de tiradas.
- Lógica de juego de ejemplo en `gameLogic.js` e `index.js` (demostrativa).

El comportamiento clave es:
- El frontend envía mensajes al endpoint `/chat`.
- El servidor consulta (RAG) fragmentos del manual en Pinecone para aportar contexto.
- La IA (Gemini) actúa como GM: puede responder narrativamente o devolver un JSON indicando que se requiere una tirada (`{"tipo":"tirada", ...}`).
- Si el GM pide tirada, el servidor genera un D666 (tres dados d6), resuelve / envía los valores a la IA para que narre la resolución y devuelve la narración junto con los dados al frontend.


**Estructura de archivos y propósito (resumen rápido)**
- `server.js` — Servidor principal Express; orquesta llamadas al modelo, RAG y resolución de tiradas.
- `ingest.js` — Script para dividir `tu_manual.txt`, generar embeddings y subirlos al índice Pinecone `manual-rpg`.
- `gameLogic.js` — Utilidades de juego (ej.: `rollDice`, `calculateMod`) y un `character` ejemplo.
- `index.js` — Ejemplo de flujo de juego con otra librería de Google AI (muestra un patrón distinto al de `server.js`).
- `systemInstruction.js` — Prompt/`system` instructivo para el GM (estilo narrativo y reglas de respuesta).
- `tu_manual.txt` — Manual largo (INS/MV) usado como fuente de conocimiento para RAG.
- `public/index.html`, `public/script.js`, `public/style.css` — Frontend minimalista que realiza POST `/chat` y muestra mensajes.
- `package.json` — Dependencias del proyecto.


**Dependencias y requerimientos**
- Node.js (versión reciente recomendada, v18+ recomendable).
- npm o yarn para instalar dependencias.
- Dependencias listadas en `package.json` (resumen relevante):
  - `express`, `cors`, `dotenv`
  - `@google/genai` (cliente Google GenAI usado en `server.js`)
  - `@pinecone-database/pinecone` (cliente Pinecone)
  - `@langchain/textsplitters`, `@langchain/core`, `@langchain/google-genai` (usados en `ingest.js`)
  - `pdf-parse`, `pdf-extraction` (instaladas aunque no se usan directamente en los scripts actuales)


**Variables de entorno**
Se usan con `dotenv` (archivo `.env` en la raíz). Variables esperadas:
- `GEMINI_API_KEY` — Clave API para Google GenAI (usada en `server.js` y `ingest.js`).
- `PINECONE_API_KEY` — Clave API para Pinecone (usada en `server.js` y `ingest.js`).
- `API_KEY` — aparece en `index.js` (ejemplo); no es usada por `server.js`.

Asegúrate de crear un archivo `.env` con estas variables antes de ejecutar.

Ejemplo `.env`:

GEMINI_API_KEY=tu_api_key_gemini
PINECONE_API_KEY=tu_api_key_pinecone


**Flujo de ejecución (end-to-end)**
1. (Opcional) Ejecutar `ingest.js` para indexar `tu_manual.txt` en Pinecone. Esto crea vectores y meta texto en el índice `manual-rpg`.
2. Iniciar servidor: `node server.js` (escucha en puerto `3000`).
3. Abrir `public/index.html` en navegador (o navegar a http://localhost:3000 si se sirve estático).
4. Usuario envía una acción por la UI; el frontend envía `{ message }` a `POST /chat`.
5. `server.js`:
   - Llama a `getContext(message)` → intenta obtener embeddings de la query y consulta Pinecone topK=3.
   - Construye un `promptConContexto` que incluye reglas INS/MV, contexto extraído y el mensaje del jugador.
   - Llama a Gemini para generar contenido (narración o petición de tirada).
   - Si la respuesta contiene JSON con `"tipo": "tirada"`, el servidor genera tres d6 (D666) y llama de nuevo al modelo con el resultado de los dados para obtener la resolución narrativa.
   - Devuelve al frontend `response` (texto narrativo) y, en caso de tirada, también `dice: [d1,d2,d3]` y `rollType: "D666"`.


**Detalle técnico por archivo**

**`server.js`**
- Librerías: `dotenv`, `@pinecone-database/pinecone`, `express`, `cors`, `@google/genai`.
- Inicialización Pinecone: `const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY }); const index = pc.index('manual-rpg');` — usa índice `manual-rpg`.
- Inicialización GoogleGenAI: `const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });` y modelo `MODEL_NAME = "gemini-2.5-flash"`.
- `getContext(query)`: intenta generar un embedding con `ai.models.embedContent({ model: "text-embedding-004", contents: [...] })`.
  - Maneja varias estructuras de respuesta (`result.embedding` o `result.embeddings`).
  - Consulta Pinecone: `index.query({ vector: queryVector, topK: 3, includeMetadata: true })`.
  - Extrae `metadata.text` de los matches y devuelve concatenado.
  - Si la generación de embedding falla, atrapa el error y devuelve string vacío (fallback seguro).
- `chatHistory` inicial contiene el `systemPrompt` (importado desde `systemInstruction.js`) en formato `{ role: "user", parts: [{ text: systemPrompt }] }` — ojo: la convención de roles puede variar según la API de GenAI.
- Endpoint `POST /chat`:
  - Crea `context` con `getContext(message)`.
  - Define `reglasINS` (snippet en línea con reglas fundamentales del sistema de juego).
  - Construye `promptConContexto` que indica claramente las instrucciones al GM e incluye una instrucción estricta: si la acción requiere azar, el GM debe devolver un JSON con el formato exacto `{"tipo":"tirada","stat":"...","dificultad":...,"razon":"..."}`.
  - Llama a `ai.models.generateContent(...)` para la primera generación (el GM decide si requiere tirada o no).
  - Detecta `requiereTirada` buscando la subcadena `"tipo": "tirada"` en el texto devuelto. (Método simple, frágil frente a formateos distintos.)
  - Si requiere tirada:
    - Genera 3 valores aleatorios 1..6 (`d1`, `d2`, `d3`) y forma `resultadoDados` como concatenación `d1d2d3`.
    - Construye `promptResolucion` con el resultado de los dados y reglas de interpretación (111 = intervención divina; 666 = intervención infernal).
    - Llama a Gemini de nuevo para que narre la resolución final.
    - Responde JSON con `response` (narración final), `dice: [d1,d2,d3]`, `rollType: "D666"`.
  - Si no requiere tirada, responde `{ response: text }`.
- Manejo de errores: try/catch en el endpoint; responde 500 con `{ error: "Error interno del GM." }` en caso de fallo.
- Nota: `chatHistory` se va llenando con los roles, pero no hay persistencia entre reinicios; además el uso de `parts` y `role` está adaptado al SDK en uso.

**Puntos técnicos y observaciones sobre `server.js`**
- La detección de petición de tirada mediante `text.includes('"tipo": "tirada"')` es funcional pero frágil: si el modelo responde con espacios, nuevas líneas o con comillas simples, puede fallar. Recomendación: intentar parsear JSON con regex y JSON.parse seguro, o indicar al modelo que devuelva `
<<JSON>>\n{...}\n<</JSON>>` para extracción robusta.
- `getContext` retorna `""` si falla la búsqueda (fallback explícito). El prompt indica "CONTEXTO DEL MANUAL: ${context || 'Usa reglas estándar.'}" — por tanto el modelo funciona sin RAG.
- El tamaño máximo de `chatHistory` no está limitado; con interacciones largas se puede crecer y encarecer llamadas a la API.
- `index.query` asume que `result.embedding.values` existe; validar forma exacta de la respuesta del SDK es importante cuando se actualizan versiones.


**`ingest.js`**
- Propósito: tokenizar/dividir `tu_manual.txt` en fragmentos y subir embeddings a Pinecone en el índice `manual-rpg`.
- Flujo:
  - Lee `tu_manual.txt` y valida longitud.
  - Usa `RecursiveCharacterTextSplitter` con `chunkSize: 1000`, `chunkOverlap: 200` para obtener `chunks`.
  - Usa `GoogleGenerativeAI` y `getGenerativeModel({ model: "text-embedding-004" })` para `embeddingModel.embedContent(content)`.
  - Convierte `result.embedding.values` a `vector` y hace `index.upsert([{ id: `chunk-${i}`, values: vector, metadata: { text: content } }])`.
- Observaciones:
  - Debes crear el índice `manual-rpg` en tu cuenta Pinecone con la dimensión correcta. La dimensión la determina el modelo de embeddings (consulta la documentación de `text-embedding-004` o prueba con una representación de vector para saber la longitud).
  - El script hace logs por cada 10 fragmentos.


**`gameLogic.js`**
- Contiene un objeto `character` de ejemplo y utilidades básicas:
  - `rollDice(sides = 20)` → devuelve aleatorio 1..sides.
  - `calculateMod(statValue)` → fórmula clásica de modificador: floor((stat-10)/2).
- Exporta `{ character, rollDice, calculateMod }`.


**`index.js`**
- Archivo demostrativo que muestra otro patrón de integración con `@google/generative-ai` (sincrónico con `getGenerativeModel` y `startChat`).
- No se usa en el servidor principal pero sirve como ejemplo para crear un loop de juego con un modelo generativo.
- Observación: referencia `systemPrompt` pero no lo importa; si se ejecuta produciría un ReferenceError — revisar si se pretende usar en producción.


**`systemInstruction.js`**
- Contiene un `systemPrompt` largo que define cómo debe comportarse el GM (estilo narrativo, formato estricto de respuesta cuando requiere tiradas, reglas de rol). Importante: el sistema obliga al GM a devolver un JSON estricto cuando una acción requiere azar.
- Esto es la fuente del comportamiento de la IA y por tanto crítico para el flujo de solicitud / tirada.


**`tu_manual.txt`**
- Archivo de texto grande con las reglas y trasfondo de INS/MV. Se indexa mediante `ingest.js` y sirve para RAG.
- Contiene contenido sensible o con derechos de autor potencial: ten cuidado con redistribución pública del texto completo.


**Frontend (`public/`)**
- `index.html` — UI minimalista con `#chat-box`, `#user-input` y botón enviar.
- `script.js` — lógica cliente que hace POST `/chat`, muestra la respuesta del GM con efecto de escritura (`typeWriter`) y, si hay `data.dice`, añade un bloque con la tirada.
- `style.css` — estilos básicos oscuros.


**Esquema RAG (cómo funciona aquí)**
- Ingestión → `ingest.js` produce vectores y `metadata.text` por chunk y los sube a Pinecone en `manual-rpg`.
- Query → `server.js` usa `getContext(message)` que genera embedding de la consulta y hace `index.query(..., topK:3, includeMetadata:true)` para recuperar los chunks más relevantes.
- Uso → esos fragmentos se concatenan y se inyectan en el prompt al modelo, mejorando precisión narrativa y/o coherencia con reglas del manual.


**Formato de interacción y contrato API**
Endpoint principal:
- POST `/chat`
  - Body: `{ "message": "texto del jugador" }`
  - Respuesta:
    - Caso narración simple: `{ "response": "texto narrativo generado por el GM" }`
    - Caso tirada requerida: `{ "response": "narracion final tras resolver dados", "dice": [d1, d2, d3], "rollType": "D666" }`
    - Caso error: HTTP 500 `{ "error": "Error interno del GM." }`

Observaciones:
- El servidor confía en que la primera llamada al modelo retornará un JSON incrustado cuando se requiera tirada; la detección se hace por substring. Sugerimos un patrón de extracción más robusto (marcadores, bloques <<JSON>> ...).


**Manejo de tiradas D666**
- Cuando el GM solicita tirada, el servidor genera 3 valores aleatorios uniformes en 1..6 (`Math.floor(Math.random() * 6) + 1`).
- Forma de interpretación usada internamente:
  - `resultadoDados` = `${d1}${d2}${d3}` (concatenación de caras como número de tres dígitos).
  - Reglas especiales: `111` → intervención divina; `666` → intervención infernal.
  - Además se calcula `sumaTotal = d1 + d2 + d3` y se pasa al prompt de resolución por si el GM la necesita.
- El servidor NO interpreta directamente el JSON de peticiones de tirada (no aplica atributos del personaje). En `index.js` hay otro ejemplo donde el cliente/componente de juego sí aplica modificadores y compara con `dificultad`.


**Errores, tolerancia a fallos y seguridad**
- Fallback RAG: Si `getContext` falla (ej. la llamada de embed falla o Pinecone no está disponible), `getContext` devuelve `""` y el servidor procede con reglas estándar. Esto evita caída total del servicio.
- Validación de la salida del modelo: actualmente mínima (se busca substring). Riesgo de mala extracción/parseo. Recomendación: forzar al modelo a delimitar el JSON con marcadores y validar con `JSON.parse` con manejo seguro.
- Llamadas a API externas (Gemini, Pinecone) deberían tener timeouts y reintentos limitados.
- No hay autenticación en el endpoint `/chat`. Si se expone públicamente, implementar al menos alguna protección (API key, rate limit o autenticación básica).
- Sanitización de inputs: se envía directamente al modelo y a la generación de embeddings; no existe un vector de ataque directo, pero conviene limitar tamaño del mensaje y longitud del historial.


**Pasos para ejecutar localmente**
1. Clonar repo y colocarse en la carpeta raíz.
2. Instalar dependencias:

```bash
npm install
```

3. Crear `.env` con las variables:

```text
GEMINI_API_KEY=tu_api_key_gemini
PINECONE_API_KEY=tu_api_key_pinecone
```

4. (Opcional pero recomendado) Ingestar el manual en Pinecone:

```bash
node ingest.js
```

Asegúrate de tener creado el índice `manual-rpg` en Pinecone con la dimensión adecuada para el modelo de embeddings (`text-embedding-004`).

5. Iniciar servidor:

```bash
node server.js
```

6. Abrir en el navegador: http://localhost:3000/ (sirve `public` estático desde `server.js`).


**Ingestión del manual a Pinecone — notas prácticas**
- Verifica en tu consola de Pinecone la creación del índice `manual-rpg` y la `dimension` correcta (p. ej. 1536 o la que corresponda al modelo de embeddings usado).
- `ingest.js` usa `RecursiveCharacterTextSplitter` con `chunkSize: 1000` y `chunkOverlap: 200`, que provee buen trade-off entre granularidad y coherencia.
- Si el proceso de ingestión se interrumpe, puedes reintentar: `upsert` con el mismo `id` sobrescribe.


**Extensiones y puntos de mejora**
- Mejorar extracción del JSON de petición de tirada: usar marcadores claros y parseo robusto.
- Limitar longitud de `chatHistory` y/o usar resúmenes para mantener costos de tokens bajos.
- Añadir autenticación y rate-limiting a `/chat` antes de exponer públicamente.
- Registrar métricas / telemetría (latencias de GEMINI, fallos Pinecone, tasa de tiradas).
- Añadir tests unitarios para utilidades (`gameLogic.js`) y pruebas de integración para el endpoint `/chat`.
- Implementar un mecanismo de persistencia para `chatHistory` (Redis o DB) si se quiere conservar estado a largo plazo entre sesiones.
- Añadir UI para animar tiradas (usar `dice` devuelto) y validaciones de frontend.


**Notas sobre compatibilidades y riesgos**
- SDKs externos (`@google/genai`, `@pinecone-database/pinecone`) cambian interfaces entre versiones; después de actualizar dependencias, validar que las llamadas (`embedContent`, `models.generateContent`, `index.query`, `index.upsert`) mantienen las mismas firmas.
- `tu_manual.txt` puede contener texto con derechos de autor. Evitar redistribuirlo sin permiso.
- Los prompts contienen instrucciones de rol y estilo. Cambios aquí alteran considerablemente el comportamiento del GM.


**Anexos**
- Endpoint expuesto:
  - `POST /chat` — espera `{ message }` y devuelve `response` y opcionalmente `dice`.
- Index Pinecone: `manual-rpg` (usar mismo nombre en `ingest.js` y `server.js`).


**Dónde continuar**
- Revisión de robustez de parsing JSON del GM.
- Añadir tests de integración (mockear Gemini & Pinecone) y tests E2E con el frontend.


---

Documento generado automáticamente por análisis del código fuente del repositorio y revisión de los archivos:
- `server.js` [server.js](server.js#L1)
- `ingest.js` [ingest.js](ingest.js#L1)
- `gameLogic.js` [gameLogic.js](gameLogic.js#L1)
- `index.js` [index.js](index.js#L1)
- `systemInstruction.js` [systemInstruction.js](systemInstruction.js#L1)
- `tu_manual.txt` [tu_manual.txt](tu_manual.txt#L1)
- `public/index.html` [public/index.html](public/index.html#L1)
- `public/script.js` [public/script.js](public/script.js#L1)
- `public/style.css` [public/style.css](public/style.css#L1)

Si querés, puedo:
- abrir el archivo y hacer cambios en el prompt para robustecer la extracción JSON, o
- agregar tests básicos y un script `npm run start` en `package.json`, o
- crear un ejemplo de `.env.example` y un `README.md` más resumido para usuarios finales. ¿Qué preferís que haga ahora?
