const { GoogleGenerativeAI } = require('@google/generative-ai');

// Thay API key của bạn vào đây
const GEMINI_API_KEY = "AIzaSyBCCCvVlI3FyQKLYmI2SdASxPiZvh8VvHY";

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function testModels() {
    const models = [
        "gemini-exp-1114",
        "gemini-pro-vision",
        "embedding-001",
    ];

    console.log('Available Gemini Models:');
    console.log('======================');

    for (const modelName of models) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            console.log(`\n✅ ${modelName}`);
            
            // Test model với một prompt đơn giản
            if (modelName !== "embedding-001") {
                const result = await model.generateContent("Hello!");
                console.log(`   Status: Working`);
            } else {
                console.log(`   Type: Embedding model`);
            }
            
        } catch (error) {
            console.log(`\n❌ ${modelName}`);
            console.log(`   Error: ${error.message}`);
        }
    }
}

// Chạy function
testModels().catch(console.error); 