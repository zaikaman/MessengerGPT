const express = require('express');
const app = express();

const VERIFY_TOKEN = "123456"; // Token bạn tự đặt

app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('Webhook được xác thực!');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
}); 