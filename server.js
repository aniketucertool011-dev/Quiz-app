const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const { URL } = require('url');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- Advanced IPv4 DNS Resolver & Proxy Pool for Render ---
const connectionString = process.env.DATABASE_URL;
let realPool = null;

const pool = {
    query: async (...args) => {
        while (!realPool) {
            await new Promise(r => setTimeout(r, 50));
        }
        return realPool.query(...args);
    }
};

if (!connectionString) {
    console.error("❌ CRITICAL ERROR: DATABASE_URL is not set in environment variables!");
} else {
    try {
        const parsedUrl = new URL(connectionString);
        const originalHost = parsedUrl.hostname;

        console.log(`🔍 Attempting IPv4 DNS lookup for host: ${originalHost}`);

        dns.lookup(originalHost, { family: 4 }, (err, ipv4Address) => {
            if (!err && ipv4Address) {
                console.log(`✅ SUCCESS: Resolved ${originalHost} to IPv4 -> ${ipv4Address}`);
                parsedUrl.hostname = ipv4Address;
            } else {
                console.log(`⚠️ WARNING: IPv4 lookup failed (${err ? err.message : 'No IP found'}). Using original hostname.`);
            }

            realPool = new Pool({
                connectionString: parsedUrl.toString(),
                ssl: {
                    rejectUnauthorized: false,
                    servername: originalHost
                },
                family: 4,
                connectionTimeoutMillis: 10000
            });

            console.log("✅ Database connection pool initialized.");
        });
    } catch (e) {
        console.error("❌ Error parsing DATABASE_URL:", e.message);
    }
}
// ----------------------------------------------------------

let players = [];
let currentQuestionIndex = 0;
let questionsList = [];
let questionTimer = null;

async function triggerNextQuestion() {
    if (questionTimer) clearTimeout(questionTimer);

    if (currentQuestionIndex < questionsList.length) {
        const currentQ = questionsList[currentQuestionIndex];
        
        io.emit('next_question', {
            questionData: currentQ,
            questionNumber: currentQuestionIndex + 1,
            totalQuestions: questionsList.length,
            timeLimit: 10
        });

        questionTimer = setTimeout(async () => {
            currentQuestionIndex++;
            await triggerNextQuestion();
        }, 10000);

    } else {
        for (let p of players) {
            await pool.query('INSERT INTO scores (player_name, score) VALUES ($1, $2)', [p.name, p.score]);
        }
        
        const sortedLeaderboard = [...players].sort((a, b) => b.score - a.score);
        io.emit('game_over', sortedLeaderboard);
    }
}

io.on('connection', (socket) => {
    console.log(`🔌 Player Connected: ${socket.id}`);

    socket.on('join_game', (playerName) => {
        const newPlayer = { id: socket.id, name: playerName, score: 0 };
        players.push(newPlayer);
        io.emit('update_players', players);
    });

    socket.on('start_quiz', async () => {
        try {
            const result = await pool.query('SELECT id, question, option1, option2, option3, option4 FROM questions');
            questionsList = result.rows;
            currentQuestionIndex = 0;

            if (questionsList.length > 0) {
                await triggerNextQuestion();
            }
        } catch (err) {
            console.error("Error starting quiz:", err.message);
        }
    });

    socket.on('submit_answer', async ({ playerName, answer }) => {
        try {
            const currentQ = questionsList[currentQuestionIndex];
            const dbCheck = await pool.query('SELECT correct_answer FROM questions WHERE id = $1', [currentQ.id]);
            const correctAnswer = dbCheck.rows[0].correct_answer;

            if (answer === correctAnswer) {
                const player = players.find(p => p.id === socket.id);
                if (player) {
                    player.score += 10;
                }
            }
        } catch (err) {
            console.error("Error verifying answer:", err.message);
        }
    });

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        io.emit('update_players', players);
        console.log(`❌ Player Disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Quiz Server running on port ${PORT}`);
});