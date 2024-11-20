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
        console.log('Invalid webhook payload:', req.body);
        return res.sendStatus(400);
    }
    
    if (req.body.object === 'page') {
        for (const entry of req.body.entry) {
            const webhook_event = entry.messaging[0];
            console.log('Webhook event:', webhook_event);
            
            // Bỏ qua tin nhắn echo
            if (webhook_event.message && webhook_event.message.is_echo) {
                console.log('Skipping echo message');
                continue;
            }
            
            if (!webhook_event.sender || !webhook_event.sender.id) {
                console.error('Invalid sender information');
                continue;
            }
            
            const sender_psid = webhook_event.sender.id;
            const message = webhook_event.message;

            // Bỏ qua các event delivery/read
            if (!message || !message.text) {
                console.log('Skipping non-message event');
                continue;
            }

            console.log('Processing message from sender:', sender_psid);
            
            try {
                const answer = await generateAnswer(message.text);
                console.log('Generated answer:', answer);
                
                const sent = await sendMessage(sender_psid, answer);
                if (!sent) {
                    console.error('Failed to send message to:', sender_psid);
                }
            } catch (error) {
                console.error('Error processing message:', error);
            }
        }
        res.sendStatus(200);
    }
});

// Generate answer using Gemini
async function generateAnswer(question) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const prompt = `Bạn là một chatbot trợ giúp. Hãy trả lời câu hỏi sau một cách tự nhiên và ngắn gọn trong giới hạn 2000 ký tự. 
        Nếu người dùng nói "tiếp đi" hoặc tương tự, hãy hỏi họ muốn biết thêm thông tin gì.
        
        Câu hỏi: ${question}`;
        
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }]
        });
        
        if (!result.response) {
            console.error('No response from Gemini');
            return "Xin lỗi, có lỗi xảy ra khi xử lý câu hỏi.";
        }

        let responseText = result.response.text();
        
        if (responseText.length > 2000) {
            responseText = responseText.substring(0, 1997) + "...";
        }
        
        console.log('Gemini response:', responseText);
        return responseText;

    } catch (error) {
        console.error('Gemini API Error:', error);
        return "Xin lỗi, có lỗi xảy ra khi xử lý câu hỏi.";
    }
}

// Send message back to user
async function sendMessage(sender_psid, text) {
    console.log('Attempting to send message to PSID:', sender_psid);
    console.log('Message content:', text);
    
    try {
        const requestBody = {
            recipient: { id: sender_psid },
            message: { text: text }
        };
        
        console.log('Request body:', JSON.stringify(requestBody));
        
        const response = await axios.post(
            `https://graph.facebook.com/v18.0/me/messages`,
            requestBody,
            {
                params: { access_token: PAGE_ACCESS_TOKEN }
            }
        );
        
        console.log('Facebook API Response:', response.data);
        
        if (response.data.error) {
            console.error('Facebook API Error:', response.data.error);
            return false;
        }
        
        return true;
    } catch (error) {
        if (error.response?.data) {
            console.error('Full Facebook API Error:', error.response.data);
        }
        console.error('Error sending message:', error.message);
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