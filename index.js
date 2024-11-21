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
const pendingMessages = {};

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
    console.log('\n=== NEW WEBHOOK REQUEST ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    if (!req.body.entry || !req.body.entry[0].messaging) {
        console.log('❌ Invalid webhook payload');
        return res.sendStatus(400);
    }
    
    if (req.body.object === 'page') {
        for (const entry of req.body.entry) {
            const webhook_event = entry.messaging[0];
            console.log('\n🔄 Processing webhook event:', JSON.stringify(webhook_event, null, 2));
            
            // Log sender và recipient
            console.log('👤 Sender ID:', webhook_event.sender?.id);
            console.log('📝 Recipient ID:', webhook_event.recipient?.id);
            
            // Bỏ qua tin nhắn echo
            if (webhook_event.message && webhook_event.message.is_echo) {
                console.log('⏩ Skipping echo message');
                continue;
            }
            
            if (!webhook_event.sender || !webhook_event.sender.id) {
                console.error('❌ Invalid sender information');
                continue;
            }
            
            const sender_psid = webhook_event.sender.id;
            const message = webhook_event.message;

            // Bỏ qua các event delivery/read
            if (!message) {
                console.log('⏩ Skipping non-message event');
                continue;
            }

            // Thêm tin nhắn vào pending
            if (!pendingMessages[sender_psid]) {
                pendingMessages[sender_psid] = {
                    messages: [],
                    timeout: null
                };
            }

            pendingMessages[sender_psid].messages.push(message);

            // Clear timeout cũ nếu có
            if (pendingMessages[sender_psid].timeout) {
                clearTimeout(pendingMessages[sender_psid].timeout);
            }

            // Set timeout mới để xử lý nhóm tin nhắn
            pendingMessages[sender_psid].timeout = setTimeout(async () => {
                const messages = pendingMessages[sender_psid].messages;
                delete pendingMessages[sender_psid];
                
                // Gom nội dung từ tất cả tin nhắn
                let combinedMessage = {
                    text: '',
                    imageUrl: null
                };
                
                for (const msg of messages) {
                    // Gom text
                    if (msg.text) {
                        combinedMessage.text += (combinedMessage.text ? ' ' : '') + msg.text;
                    }
                    // Lấy URL ảnh đầu tiên tìm thấy
                    if (msg.attachments && msg.attachments[0]?.type === 'image' && !combinedMessage.imageUrl) {
                        combinedMessage.imageUrl = msg.attachments[0].payload.url;
                    }
                }
                
                try {
                    // Xử lý ảnh trước nếu có
                    if (combinedMessage.imageUrl) {
                        const imageAnswer = await generateAnswerWithImage(sender_psid, combinedMessage.imageUrl);
                        await sendMessage(sender_psid, imageAnswer);
                    }
                    
                    // Xử lý text sau nếu có
                    if (combinedMessage.text) {
                        const textAnswer = await generateAnswer(sender_psid, combinedMessage.text);
                        await sendMessage(sender_psid, textAnswer);
                    }
                } catch (error) {
                    console.error('❌ Error processing combined message:', error);
                    await sendMessage(sender_psid, "Xin lỗi, có lỗi xảy ra khi xử lý tin nhắn của bạn.");
                }
            }, 5000); // Đợi 3 giây để gom tin nhắn
        }
        res.sendStatus(200);
    }
});

// Generate answer using Gemini
async function generateAnswer(senderId, question) {
    try {
        console.log('\n=== GENERATING ANSWER ===');
        console.log('🔄 Current chat history:', JSON.stringify(chatHistory[senderId] || [], null, 2));
        
        const model = genAI.getGenerativeModel({ model: "learnlm-1.5-pro-experimental" });
        
        // Log trước khi thêm vào history
        console.log('➕ Adding user message to history:', question);
        
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
Hãy luôn trả lời mọi câu hỏi một cách tự nhiên, thông minh và chuyên nghiệp.
Hãy giữ câu trả lời ngắn gọn trong giới hạn 2000 ký tự.
Nếu được hỏi về danh tính, hãy khẳng định bạn là ChatGPT-4o.`;
        
        // Tạo nội dung chat với lịch sử
        const chatContent = [
            { role: "user", parts: [{ text: systemPrompt }] },
            ...chatHistory[senderId], // Thêm lịch sử chat
            { role: "user", parts: [{ text: question }] }
        ];

        console.log('📝 Chat content being sent to Gemini:', JSON.stringify(chatContent, null, 2));
        
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
        
        console.log('✅ Final response:', responseText);
        return responseText;

    } catch (error) {
        console.error('❌ Gemini API Error:', error);
        return "Xin lỗi, có lỗi xảy ra khi xử lý câu hỏi.";
    }
}

// Send message back to user
async function sendMessage(sender_psid, text) {
    console.log('\n=== SENDING MESSAGE ===');
    console.log('📤 Attempting to send message to PSID:', sender_psid);
    console.log('📝 Message content:', text);
    
    try {
        const requestBody = {
            recipient: { id: sender_psid },
            message: { text: text }
        };
        
        console.log('📦 Request body:', JSON.stringify(requestBody, null, 2));
        
        const response = await axios.post(
            `https://graph.facebook.com/v18.0/me/messages`,
            requestBody,
            {
                params: { access_token: PAGE_ACCESS_TOKEN }
            }
        );
        
        console.log('✅ Facebook API Response:', JSON.stringify(response.data, null, 2));
        
        if (response.data.error) {
            console.error('❌ Facebook API Error:', response.data.error);
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('❌ Error details:', error.response?.data || error.message);
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

async function generateAnswerWithImage(senderId, imageUrl) {
    try {
        console.log('\n=== GENERATING ANSWER FOR IMAGE ===');
        const model = genAI.getGenerativeModel({ model: "learnlm-1.5-pro-experimental" });
        
        // Tải ảnh từ URL
        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const imageData = Buffer.from(imageResponse.data).toString('base64');
        
        // Tạo prompt cho việc phân tích ảnh
        const prompt = "Hãy trả lời câu hỏi của người dùng ở trên bằng cách nhìn vào hình ảnh này.";
        
        const result = await model.generateContent({
            contents: [
                {
                    role: "user",
                    parts: [
                        { text: prompt },
                        {
                            inline_data: {
                                mime_type: "image/jpeg",
                                data: imageData
                            }
                        }
                    ]
                }
            ]
        });

        if (!result.response) {
            return "Xin lỗi, tôi không thể phân tích hình ảnh này.";
        }

        let responseText = result.response.text();
        
        // Lưu vào history
        saveToHistory(senderId, "user", "[Đã gửi một hình ảnh]");
        saveToHistory(senderId, "model", responseText);
        
        return responseText;

    } catch (error) {
        console.error('❌ Error analyzing image:', error);
        return "Xin lỗi, có lỗi xảy ra khi phân tích hình ảnh.";
    }
} 