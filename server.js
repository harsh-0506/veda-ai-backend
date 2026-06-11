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
                    
                    if (extractedText.trim().length < 50) {
                        console.log("⚠️ WARNING: Very little text found. Is this a scanned image instead of a text PDF?");
                    }

                } else {
                    extractedText = req.file.buffer.toString('utf-8');
                    hasDocument = true;
                    console.log(`✅ Raw Text Extracted! Found ${extractedText.length} characters.`);
                }
            } catch (err) {
                console.error("❌ Failed to parse file text.", err.message);
            }
        }

        // --- NEW: GARBAGE TEXT DETECTOR ---
        let isTextGarbage = false;
        if (hasDocument && extractedText.trim().length < 300) {
            console.log("⚠️ WARNING: Extremely low character count detected. Flagging document as unreadable for AI.");
            isTextGarbage = true;
        }

        const prompt = `
        You are an expert teacher creating an exam paper. 
        
        SUBJECT REQUESTED BY TEACHER: ${order.subject || "Not specified"}
        ADDITIONAL INSTRUCTIONS: ${order.instructions || "None"}

        SOURCE MATERIAL UPLOADED BY TEACHER:
        """
        ${isTextGarbage ? "UNREADABLE_DOCUMENT_FORMAT" : extractedText}
        """

        TEACHER'S REQUIREMENTS:
        Generate exactly these sections, question types, and question counts:
        ${JSON.stringify(order.sections, null, 2)}
        Total Required Marks: ${order.totals.marks}

        CRITICAL INSTRUCTIONS FOR AI:
        1. If the SOURCE MATERIAL says "UNREADABLE_DOCUMENT_FORMAT" or is mostly blank/garbage, DO NOT generate questions about blank pages. Instead, rely ENTIRELY on the "SUBJECT REQUESTED BY TEACHER" and "ADDITIONAL INSTRUCTIONS" to generate a highly accurate, academic test from your own knowledge.
        2. If the user provided a Subject (e.g., "Science"), you MUST write questions about that Subject.
        3. If a section is "Give examples", look at the "extraParam" field to know exactly how many examples to ask for per question (e.g., "Give 3 examples of...").
        4. If a section is "Assertion and Reason", use standard A & R formatting with 4 choices.
        5. If a section is "Give reasons", formulate questions starting with "Give reasons why...".

        CRITICAL REQUIREMENT: Output ONLY valid JSON using this exact modular structure. 
        Every single question must be its own object with an "id" and a numeric "marks" value (which can be a decimal like 0.5).
        
        Use this exact JSON schema:
        {
          "assignmentDetails": {
            "schoolName": "Hallmark World School",
            "examination": "Half Yearly Examination",
            "subject": "${order.subject || "Determined by document"}",
            "class": "Determined by document",
            "totalMarks": ${order.totals.marks}
          },
          "sections": [
            {
              "sectionId": "sec-1",
              "sectionTitle": "Section A: [Insert Type Here]",
              "type": "[Matches the type requested by teacher]",
              "questions": [
                {
                  "id": "q-1",
                  "text": "Actual question text goes here... (Include Assertion/Reason text here if applicable)",
                  "options": ["a", "b", "c", "d"], 
                  "answer": "The correct answer key",
                  "marks": 2.5
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