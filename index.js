const express = require('express');
const app = express();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

// Thay các giá trị này
const GEMINI_API_KEY = "your_gemini_api_key";  // API key từ Google AI Studio
const VERIFY_TOKEN = "your_verify_token";       // Tự đặt token bất kỳ
const PAGE_ACCESS_TOKEN = "your_page_token";    // Token từ Facebook Developer Console

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

app.use(express.json());

// Webhook verification
app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
        res.send(req.query['hub.challenge']);
    } else {
        res.sendStatus(403);
    }
});

// Handle messages
app.post('/webhook', async (req, res) => {
    if (req.body.object === 'page') {
        for (const entry of req.body.entry) {
            const webhook_event = entry.messaging[0];
            const sender_psid = webhook_event.sender.id;
            const message = webhook_event.message;

            if (message.text.startsWith('/gemini')) {
                const question = message.text.replace('/gemini', '').trim();
                const answer = await generateAnswer(question);
                await sendMessage(sender_psid, answer);
            }
        }
        res.sendStatus(200);
    }
});

// Generate answer using Gemini
async function generateAnswer(question) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent(question);
        return result.response.text();
    } catch (error) {
        return "Xin lỗi, có lỗi xảy ra.";
    }
}

// Send message back to user
async function sendMessage(sender_psid, text) {
    try {
        await axios.post(
            `https://graph.facebook.com/v18.0/me/messages`,
            {
                recipient: { id: sender_psid },
                message: { text: text }
            },
            {
                params: { access_token: PAGE_ACCESS_TOKEN }
            }
        );
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 