const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI('YOUR_API_KEY');

// Khởi tạo model
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

async function handleMessage(message) {
    if (message.startsWith('/gemini')) {
        const question = message.replace('/gemini', '').trim();
        try {
            const result = await model.generateContent(question);
            const response = await result.response;
            return response.text();
        } catch (error) {
            return "Xin lỗi, có lỗi xảy ra khi xử lý câu hỏi của bạn.";
        }
    }
} 