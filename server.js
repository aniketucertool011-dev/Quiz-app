const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
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

// PostgreSQL Connection using Connection String & SSL for Cloud
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

let players = [];
let currentQuestionIndex = 0;
let questionsList = [];
let questionTimer = null;

// Function to handle auto-progressing questions
async function triggerNextQuestion() {
    if (questionTimer) clearTimeout(questionTimer);

    if (currentQuestionIndex < questionsList.length) {
        const currentQ = questionsList[currentQuestionIndex];
        
        // Broadcast question to all players with a 10-second duration
        io.emit('next_question', {
            questionData: currentQ,
            questionNumber: currentQuestionIndex + 1,
            totalQuestions: questionsList.length,
            timeLimit: 10 // 10 seconds
        });

        // Server-side timer: Automatically move to next question after 10 seconds
        questionTimer = setTimeout(async () => {
            currentQuestionIndex++;
            await triggerNextQuestion();
        }, 10000); // 10 seconds

    } else {
        // Game Over: Save scores & show leaderboard
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
                    player.score += 10; // 10 points for correct answer
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

const PORT = 5000;
server.listen(PORT, () => {
    console.log(`🚀 Quiz Server running on http://localhost:${PORT}`);
});