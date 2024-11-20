const express = require('express');
const app = express();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

// Thay các giá trị này
const GEMINI_API_KEY = "AIzaSyBCCCvVlI3FyQKLYmI2SdASxPiZvh8VvHY";  // API key từ Google AI Studio
const VERIFY_TOKEN = "123456";       // Tự đặt token bất kỳ
const PAGE_ACCESS_TOKEN = "EAAXxk0ACgZBwBOZCVGgbrAyvF5ZBN1fQKy7LdgmbNlgWOjrZBgioxDZCZAAqLrwXh49tThOxcIj9kq1PUlzzn7MbkxqYRBM5lmIfnEYYErwxatmgFZCgujgcD3QTMQJq3G1bBX0QSDokxPFhQ09gZBPou4hwzfZAzZBQxZBemhJAlENGoKlDRCcd6U12ZCdJBi87ePZC7";    // Token từ Facebook Developer Console

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
    if (!req.body.entry || !req.body.entry[0].messaging) {
        return res.sendStatus(400);
    }
    if (req.body.object === 'page') {
        for (const entry of req.body.entry) {
            const webhook_event = entry.messaging[0];
            const sender_psid = webhook_event.sender.id;
            const message = webhook_event.message;

            if (message && message.text) {
                try {
                    const answer = await generateAnswer(message.text);
                    const sent = await sendMessage(sender_psid, answer);
                    if (!sent) {
                        console.error('Failed to send message to:', sender_psid);
                    }
                } catch (error) {
                    console.error('Error processing message:', error);
                }
            }
        }
        res.sendStatus(200);
    }
});

// Generate answer using Gemini
async function generateAnswer(question) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-exp-1114" });
        const result = await model.generateContent(question);
        return result.response.text();
    } catch (error) {
        return "Xin lỗi, có lỗi xảy ra.";
    }
}

// Send message back to user
async function sendMessage(sender_psid, text) {
    try {
        const response = await axios.post(
            `https://graph.facebook.com/v18.0/me/messages`,
            {
                recipient: { id: sender_psid },
                message: { text: text }
            },
            {
                params: { access_token: PAGE_ACCESS_TOKEN }
            }
        );
        
        if (response.data.error) {
            console.error('Facebook API Error:', response.data.error);
            return false;
        }
        
        return true;
    } catch (error) {
        if (error.response) {
            console.error('Facebook API Error:', error.response.data.error);
        } else {
            console.error('Error sending message:', error.message);
        }
        return false;
    }
}

// Thêm basic error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 