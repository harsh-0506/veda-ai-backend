require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk'); 

const app = express();
app.use(cors());
app.use(express.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.post('/api/generate', async (req, res) => {
    console.log("🛎️ DING! Order received. Waking up the Real Groq AI Chef...");

    try {
        const order = req.body;
        
        // THE NEW MASTER PROMPT
        // We teach the AI to output the exact "type" fields your React frontend is expecting!
        const prompt = `
        You are an expert teacher creating an exam paper. 
        Generate a question paper based on these exact requirements:
        - Total Questions: ${order.totals.questions}
        - Total Marks: ${order.totals.marks}
        - Additional Instructions: ${order.instructions || "None provided"}
        - Sections required: ${JSON.stringify(order.sections)}

        CRITICAL REQUIREMENT: Output ONLY valid JSON using this exact structure. 
        For the "type" field in each section, you MUST strictly use one of these exact strings so the frontend can render it: 
        "Multiple Choice Questions", "Short Questions", "Numerical Problems", or "Diagram/Graph-Based Questions".
        If the type is "Multiple Choice Questions", you MUST include an "options" array with 4 choices.

        {
          "assignmentDetails": {
            "subject": "Determined by instructions",
            "dueDate": "${order.dueDate}",
            "totalMarks": ${order.totals.marks}
          },
          "sections": [
            {
              "sectionTitle": "Section A",
              "type": "Multiple Choice Questions", 
              "instructions": "Attempt all questions.",
              "questions": [
                {
                  "id": "q1",
                  "text": "Actual question text goes here...",
                  "options": ["A) First", "B) Second", "C) Third", "D) Fourth"],
                  "difficulty": "Easy",
                  "marks": 2
                }
              ]
            }
          ]
        }
        `;

        // Send the order to Groq's newest model
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: "You are a JSON-generating assistant. You only output valid JSON." },
                { role: "user", content: prompt }
            ],
            model: "llama-3.3-70b-versatile", 
            response_format: { type: "json_object" }, 
        });

        // Unpack the response
        const responseText = chatCompletion.choices[0].message.content;
        const generatedPaper = JSON.parse(responseText);

        console.log("✅ Groq AI has finished cooking a dynamic paper!");

        res.json({ 
            status: "success", 
            message: "Real AI Generation Complete!",
            data: generatedPaper 
        });

    } catch (error) {
        console.error("❌ The kitchen caught on fire:", error.message);
        res.status(500).json({ status: "error", message: "Failed to generate assignment." });
    }
});

// Turn the server on
app.listen(5000, () => {
    console.log("🚀 Backend server (Groq AI Mode) is running on http://localhost:5000");
});