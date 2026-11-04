const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');
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

// --- Initialize Supabase HTTP/HTTPS Client (Bypasses all TCP/IPv6 errors!) ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ CRITICAL ERROR: Supabase URL or Anon Key is missing!");
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log("✅ Supabase HTTPS client initialized successfully.");

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
        // Game Over: Save scores using Supabase API
        for (let p of players) {
            const { error } = await supabase
                .from('scores')
                .insert([{ player_name: p.name, score: p.score }]);
            if (error) console.error("Error saving score:", error.message);
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
            // Fetch questions via Supabase HTTP API
            const { data, error } = await supabase
                .from('questions')
                .select('id, question, option1, option2, option3, option4');

            if (error) throw error;

            questionsList = data;
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
            const { data, error } = await supabase
                .from('questions')
                .select('correct_answer')
                .eq('id', currentQ.id)
                .single();

            if (error) throw error;

            if (data && answer === data.correct_answer) {
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