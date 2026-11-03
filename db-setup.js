const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function setupDatabase() {
    try {
        console.log("Connecting to database...");

        // 1. Questions Table Banana
        await pool.query(`
            CREATE TABLE IF NOT EXISTS questions (
                id SERIAL PRIMARY KEY,
                question TEXT NOT NULL,
                option1 VARCHAR(255) NOT NULL,
                option2 VARCHAR(255) NOT NULL,
                option3 VARCHAR(255) NOT NULL,
                option4 VARCHAR(255) NOT NULL,
                correct_answer VARCHAR(255) NOT NULL
            );
        `);
        console.log("✅ 'questions' table created successfully!");

        // 2. Scores Table Banana
        await pool.query(`
            CREATE TABLE IF NOT EXISTS scores (
                id SERIAL PRIMARY KEY,
                player_name VARCHAR(100) NOT NULL,
                score INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ 'scores' table created successfully!");

        // 3. Sample Questions Insert Karna
        await pool.query(`
            INSERT INTO questions (question, option1, option2, option3, option4, correct_answer) 
            VALUES 
            ('What does HTML stand for?', 'Hyper Text Markup Language', 'High Tech Modern Language', 'Hyperlink and Text Markup Language', 'Home Tool Markup Language', 'Hyper Text Markup Language'),
            ('Which language is known as the language of the web?', 'Python', 'C++', 'JavaScript', 'Java', 'JavaScript'),
            ('What does CSS stand for?', 'Colorful Style Sheets', 'Cascading Style Sheets', 'Computer Style Sheets', 'Creative Style Sheets', 'Cascading Style Sheets'),
            ('Which of these is a JavaScript framework?', 'Django', 'Flask', 'React', 'Laravel', 'React')
            ON CONFLICT DO NOTHING;
        `);
        console.log("✅ Sample questions inserted successfully!");

        process.exit(0);
    } catch (err) {
        console.error("❌ Error setting up database:", err.message);
        process.exit(1);
    }
}

setupDatabase();