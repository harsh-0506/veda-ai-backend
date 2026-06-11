require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk'); 
const multer = require('multer');

// THE V2 IMPORT: We specifically extract the PDFParse class
const { PDFParse } = require('pdf-parse'); 

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.post('/api/generate', upload.single('document'), async (req, res) => {
    console.log("🛎️ DING! Order received. Waking up the Real Groq AI Chef...");

    try {
        const order = JSON.parse(req.body.data);
        
        let extractedText = "No source document provided.";
        let hasDocument = false; 

        if (req.file) {
            console.log(`📄 File received: ${req.file.originalname}`);
            try {
                if (req.file.mimetype === 'application/pdf' || req.file.originalname.endsWith('.pdf')) {
                    
                    const parser = new PDFParse({ data: req.file.buffer });
                    const pdfData = await parser.getText();
                    await parser.destroy();
                    
                    extractedText = pdfData.text;
                    
                    const MAX_CHARS = 25000; 
                    if (extractedText.length > MAX_CHARS) {
                        console.log(`⚠️ Document too large! Truncating from ${extractedText.length} down to ${MAX_CHARS} characters.`);
                        extractedText = extractedText.substring(0, MAX_CHARS);
                    }

                    hasDocument = true;
                    console.log(`✅ PDF Extracted and ready! Sending ${extractedText.length} characters to AI.`);
                    
                } else {
                    extractedText = req.file.buffer.toString('utf-8');
                    hasDocument = true;
                }
            } catch (err) {
                console.error("❌ Failed to parse file text.", err.message);
            }
        }

        // --- THE GARBAGE TEXT DETECTOR ---
        let isTextGarbage = false;
        if (hasDocument && extractedText.trim().length < 300) {
            console.log("⚠️ WARNING: Extremely low character count detected. Flagging document as unreadable for AI.");
            isTextGarbage = true;
        }

        // --- THE UPGRADED, STRICT PROMPT ---
        const prompt = `
        You are an expert teacher creating a Science exam paper for Class 3 students. 
        
        SUBJECT: ${order.subject || "Not specified"}
        ADDITIONAL INSTRUCTIONS: ${order.instructions || "None"}

        SOURCE MATERIAL UPLOADED BY TEACHER:
        """
        ${isTextGarbage ? "UNREADABLE_DOCUMENT_FORMAT" : extractedText}
        """

        TEACHER'S REQUIREMENTS:
        Generate exactly these sections, question types, and question counts:
        ${JSON.stringify(order.sections, null, 2)}
        Total Marks Based on 'Attempt' limit: ${order.totals.marks}

        STRICT BEHAVIORAL RULES:
        1. TEXT-BOUND ONLY: You MUST ONLY extract facts from the "SOURCE MATERIAL". If the material says "UNREADABLE_DOCUMENT_FORMAT", use the SUBJECT to generate questions strictly based on standard Class 3 Science curriculum. NEVER invent questions about planets, outer space, or advanced biology if not in the text.
        2. NO REPETITION: You are forbidden from reusing a concept. For example, if you ask about 'seed coat' in MCQs, you CANNOT ask about it in Fill in the Blanks. Every single question must be unique.
        3. FILL IN THE BLANKS: The blank line must be "__________". It MUST be in the middle of a descriptive sentence. DO NOT place it at the end. Example: "The __________ protects the baby plant inside the seed."
        4. MATCH THE FOLLOWING: If the type is "Match the following", you MUST provide a "matchPairs" array with 4-5 key-value pairs. Do NOT put standard text questions in this section.
        5. OR CHOICE: If 'hasOrChoice' is true, add "orQuestionText" to at least one question in that section.
        6. ATTEMPT LIMITS: For any section where attemptCount < count, include the instruction: "Attempt any [attemptCount] out of [count] questions."
        7. MARKING: You must output 'marks' as a number (e.g., 0.25, 0.5, 1.25). 

        OUTPUT FORMAT (STRICT JSON):
        You must return ONLY the JSON object. Do not include any conversational filler. 
        
        {
          "assignmentDetails": {
            "schoolName": "HALLMARK WORLD SCHOOL",
            "examination": "HALF YEARLY EXAMINATION",
            "subject": "${order.subject || "Science"}",
            "branch": "${order.branchName || ""}",
            "teacherName": "${order.teacherName || ""}",
            "totalMarks": ${order.totals.marks}
          },
          "sections": [
            {
              "sectionId": "sec-1",
              "sectionTitle": "Section Title",
              "instructions": "Attempt any N questions from this section.",
              "type": "Must match the requested type",
              "questions": [
                {
                  "id": "q-1",
                  "text": "The sentence with __________ in the middle (for blanks) or the full question text.",
                  "orQuestionText": "Alternative question text (only if OR is enabled)",
                  "options": ["a", "b", "c", "d"], 
                  "matchPairs": [ {"left": "Term A", "right": "Definition A"} ],
                  "answer": "Correct answer",
                  "marks": 0.5
                }
              ]
            }
          ]
        }
        `;

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: "You are a JSON-generating assistant. You only output valid JSON." },
                { role: "user", content: prompt }
            ],
            model: "llama-3.3-70b-versatile", 
            response_format: { type: "json_object" }, 
        });

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

app.listen(5000, () => {
    console.log("🚀 Backend server (Groq AI Mode) is running on http://localhost:5000");
});