const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');
const fs = require('fs'); // Para manejar la escritura de archivos
const path = require('path'); // Para trabajar con rutas de archivos

const app = express();
const port = process.env.PORT || 3000; // El puerto 3000 es local

// Middleware para manejar CORS
app.use(cors());
app.use(bodyParser.json());

const conversationHistory = [
    { role: 'user', content: 'Hola' }
    // Agrega más mensajes según sea necesario
];

app.post('/reset-history', (req, res) => {
    // Reiniciar el historial de conversación
    conversationHistory.length = 0;
    conversationHistory.push({ role: 'user', content: 'Hola' }); // Inicializa con el mensaje de inicio

    res.json({ message: 'Historial de conversación reiniciado' });
});


// Función para transformar el array de objetos en una cadena
function formatConversation(history) {
    return history.map(entry => `role: ${entry.role} content: ${entry.content}`).join(', ');
}
// Función para convertir asteriscos en etiquetas <strong> o <em>
function parseMessage(text) {
    if (typeof text !== 'string') {
        return text; // Si no es una cadena, devuelve el texto tal como está
    }
    // Reemplazar **texto** por <strong>texto</strong> (negrita)
    let parsedText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Reemplazar *texto* por <em>texto</em> (cursiva)
    parsedText = parsedText.replace(/\*(.*?)\*/g, '<em>$1</em>');
    return parsedText;
}

// Ruta para manejar la petición desde el frontend
app.post('/endpoint', async (req, res) => {
    const { query, username, password } = req.body; // Recibir las credenciales del frontend

    try {


        // Actualizar el contexto usando el historial de conversación
        const chatHistory = formatConversation(conversationHistory);

        // Aquí configuramos la estructura de la petición a la API externa
        const apiRequestData = {
            "message": {
                "chatHistory": chatHistory,
                "context": "Eres un transformador de lenguaje natural a xml. Tienes una estructura XML con campos vacíos. Necesito que, basándote en el contenido de un mensaje, rellenes estos campos solo si la información está presente en el mensaje. Si no está, el campo debe quedar vacío.No te inventes valores. Tus respuestas SIEMPRE tienen que tener esta estructura: <?xml version=\"1.0\" encoding=\"UTF-8\"?><root><content>En este campo introduces cualquier cosa que generes como respuesta. Sea lo que sea lo introduces aqui.</content><listado> Si el mensaje contiene la palabra 'listado', rellena este campo con el valor 'listado'. Solo si el mensaje contiene esa palabra. Si no lo encuentras, no rellenes el campo. </listado><id> Este campo representa un identificador único. Si en el contenido del mensaje encuentras un número o un valor que claramente representa un ID, rellénalo aquí. Si no lo encuentras, deja el campo vacío no rellenes con nada el campo. </id><factura> Si el mensaje menciona una 'factura', rellena este campo con el valor 'factura'. Si no lo encuentras, deja el campo vacío.</factura></root> no te inventes datos y no respondas nada mas fuera de la estructura xml tu respuesta solo puede estar contenida en estos campos.",
                "query": query
            }
        }

        // Configura las credenciales para la autenticación Basic usando las credenciales recibidas
        const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');

        // Hacemos la petición a la API externa
        const apiResponse = await axios.post(
            'https://inetum-integration-suite-demo-ng207k79.it-cpi023-rt.cfapps.eu20-001.hana.ondemand.com/http/chatbot/api/chat',
            apiRequestData,
            {
                headers: {
                    'Authorization': `Basic ${basicAuth}`,
                    'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer' // Para manejar correctamente los archivos binarios (como PDFs)
            }
        );

        const contentType = apiResponse.headers['content-type'];

        if (contentType === 'application/pdf') {
            // Si la respuesta es un PDF, guardamos el archivo y lo enviamos al frontend para descargarlo
            const pdfBuffer = apiResponse.data;
            const pdfPath = path.join(__dirname, 'archivo.pdf'); // Ruta donde se guardará el PDF

            fs.writeFileSync(pdfPath, pdfBuffer); // Guardar el archivo en el servidor

            // Enviar el PDF al cliente para que lo descargue
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="archivo.pdf"');
            res.send(pdfBuffer);
        } else {
            // Si no es un PDF, procesamos la respuesta normalmente
            const apiResponseData = apiResponse.data.toString('utf-8'); // Convertimos el buffer a string si es necesario
            const formattedResponse = parseMessage(apiResponseData); // Parsear el mensaje para reemplazar asteriscos

            // Agregar la consulta del usuario al historial
            conversationHistory.push({ role: 'assistant', content: query });
            conversationHistory.push({ role: 'assistant', content: formattedResponse });

            // Devolver la respuesta formateada al frontend
            res.json({
                response: formattedResponse
            });
        }
    } catch (error) {
        if (error.response && error.response.status === 401) {
            // Si la API externa responde con 401, informamos de que las credenciales son incorrectas
            console.error('Error 401 - No autorizado:', error);
            res.status(401).json({ error: 'Credenciales incorrectas. No autorizado.' });
        } else if (error.response) {
            // Convertir el buffer a string si el error contiene un buffer
            let errorData = error.response.data;
            
            if (Buffer.isBuffer(errorData)) {
                errorData = errorData.toString('utf-8');
            }

            res.status(error.response.status).json({
                error: `Error de la API externa: ${error.response.status}`,
                responseData: errorData // Enviar la respuesta convertida a texto
            });
        } else {
            // Otro tipo de error (sin respuesta de la API)
            console.error('Error al conectar con la API externa:', error.message);
            res.status(500).json({ error: 'Error al conectar con la API externa' });
        }
    }
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor corriendo en el puerto ${port}`);
});
