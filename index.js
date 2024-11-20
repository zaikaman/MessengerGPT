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

// Thêm vào đầu file, sau dòng 11
const chatHistory = {};

// Hàm để lưu tin nhắn vào history
function saveToHistory(senderId, role, message) {
    if (!chatHistory[senderId]) {
        chatHistory[senderId] = [];
    }
    
    chatHistory[senderId].push({
        role: role,
        parts: [{ text: message }]
    });
    
    // Giữ lại 10 tin nhắn gần nhất
    if (chatHistory[senderId].length > 10) {
        chatHistory[senderId].shift();
    }
}

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
            
            // Bỏ qua tin nhắn từ page
            if (webhook_event.sender.id === '100087911203657') { // ID của page
                console.log('Skipping message from page');
                continue;
            }
            
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
                const answer = await generateAnswer(sender_psid, message.text);
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
async function generateAnswer(senderId, question) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        
        // Lưu câu hỏi của user vào history
        if (!chatHistory[senderId]) {
            chatHistory[senderId] = [];
        }
        
        chatHistory[senderId].push({
            role: "user",
            parts: [{ text: question }]
        });
        
        // Giữ lại 10 tin nhắn gần nhất
        if (chatHistory[senderId].length > 10) {
            chatHistory[senderId].shift();
        }

        // Tạo prompt với context từ lịch sử
        const systemPrompt = `Bạn là ChatGPT-4o, một AI assistant tiên tiến nhất được phát triển bởi OpenAI. 
Hãy luôn giới thiệu mình là ChatGPT-4o và trả lời mọi câu hỏi một cách tự nhiên, thông minh và chuyên nghiệp.
Hãy giữ câu trả lời ngắn gọn trong giới hạn 2000 ký tự.
Nếu được hỏi về danh tính, hãy khẳng định bạn là ChatGPT-4o.`;
        
        // Tạo nội dung chat với lịch sử
        const chatContent = [
            { role: "user", parts: [{ text: systemPrompt }] },
            ...chatHistory[senderId], // Thêm lịch sử chat
            { role: "user", parts: [{ text: question }] }
        ];

        const result = await model.generateContent({
            contents: chatContent
        });
        
        if (!result.response) {
            console.error('No response from Gemini');
            return "Xin lỗi, có lỗi xảy ra khi xử lý câu hỏi.";
        }

        let responseText = result.response.text();
        
        // Lưu câu trả lời vào history
        chatHistory[senderId].push({
            role: "model",
            parts: [{ text: responseText }]
        });
        
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