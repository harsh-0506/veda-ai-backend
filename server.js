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
        You are an expert teacher creating an exam paper. 
        
        GRADE LEVEL: Class 3 (Approx. 8-9 years old). The vocabulary and difficulty MUST be strictly appropriate for young children. DO NOT use advanced concepts.
        SUBJECT: ${order.subject || "Not specified"}
        ADDITIONAL INSTRUCTIONS: ${order.instructions || "None"}

        SOURCE MATERIAL UPLOADED BY TEACHER:
        """
        ${isTextGarbage ? "UNREADABLE_DOCUMENT_FORMAT" : extractedText}
        """

        TEACHER'S REQUIREMENTS:
        Generate exactly these sections, question types, and question counts:
        ${JSON.stringify(order.sections, null, 2)}

        CRITICAL INSTRUCTIONS FOR AI (READ CAREFULLY):
        1. NO HALLUCINATION: If the SOURCE MATERIAL says "UNREADABLE_DOCUMENT_FORMAT", rely ENTIRELY on the SUBJECT and ADDITIONAL INSTRUCTIONS to generate a highly accurate Class 3 test. 
        2. NO REPETITION: You MUST NOT repeat the same question across different sections. Every question must be unique.
        3. Match the Following: If a section is "Match the following", you MUST NOT provide standard text questions. Instead, provide a "matchPairs" array inside the question object containing 4-5 items to match.
        4. Give Examples: Look at "extraParam" to know exactly how many examples to ask for (e.g., "Give 3 examples of...").
        5. Assertion/Reason: Use standard A & R formatting with 4 standard choices.
        6. Internal Choice (OR): If a section has "hasOrChoice: true", add an "orQuestionText" property to AT LEAST ONE question in that section.
        7. Attempt Limits: If "attemptCount" is less than "count", add instructions to the section title (e.g., "Attempt any 3 questions").

        CRITICAL REQUIREMENT: Output ONLY valid JSON. The schoolName MUST be exactly "HALLMARK WORLD SCHOOL".
        
        Use this exact JSON schema:
        {
          "assignmentDetails": {
            "schoolName": "HALLMARK WORLD SCHOOL",
            "examination": "HALF YEARLY EXAMINATION",
            "subject": "${order.subject || "Determined by document"}",
            "branch": "${order.branchName || ""}",
            "teacherName": "${order.teacherName || ""}",
            "totalMarks": ${order.totals.marks}
          },
          "sections": [
            {
              "sectionId": "sec-1",
              "sectionTitle": "Section A: [Insert Type Here]",
              "instructions": "Attempt [attemptCount] questions from this section.",
              "type": "[Matches the type requested by teacher]",
              "questions": [
                {
                  "id": "q-1",
                  "text": "Primary question text here... (Leave blank if this is a Match the Following question)",
                  "orQuestionText": "Alternative question text goes here (ONLY if hasOrChoice is true)",
                  "options": ["a", "b", "c", "d"], 
                  "matchPairs": [ {"left": "Apple", "right": "Fruit"}, {"left": "Potato", "right": "Vegetable"} ], // ONLY include this array if the type is "Match the following"
                  "answer": "The correct answer key",
                  "marks": 1.25
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