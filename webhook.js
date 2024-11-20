const express = require('express');
const app = express();

app.post('/webhook', async (req, res) => {
    const { message, sender } = req.body;
    
    if (message.text.startsWith('/gemini')) {
        const response = await handleMessage(message.text);
        // Gửi response về messenger
        await sendMessageToMessenger(sender.id, response);
    }
    
    res.sendStatus(200);
}); 