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
                    
                    // THE V2 EXTRACTION LOGIC
                    // We initialize the new parser class and pass the file buffer into the 'data' property
                    const parser = new PDFParse({ data: req.file.buffer });
                    
                    // We extract the text
                    const pdfData = await parser.getText();
                    
                    // We destroy the parser to free up server memory
                    await parser.destroy();
                    
                    extractedText = pdfData.text;
                    hasDocument = true;
                    
                    console.log(`✅ PDF Extracted! Found ${extractedText.length} characters of text.`);
                    
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

        const prompt = `
        You are an expert teacher creating an exam paper. 
        Generate a question paper based on these exact requirements:
        - Total Questions: ${order.totals.questions}
        - Total Marks: ${order.totals.marks}
        - Additional Instructions: ${order.instructions || "None provided"}
        - Sections required: ${JSON.stringify(order.sections)}

        SOURCE MATERIAL UPLOADED BY TEACHER:
        """
        ${extractedText}
        """
        
        ${hasDocument ? 
        "CRITICAL INSTRUCTION: You MUST generate questions that test the knowledge contained EXACTLY in the 'SOURCE MATERIAL' above. Do not invent questions outside of this provided text." 
        : "No document was provided. Generate standard questions based on the additional instructions."}

        CRITICAL REQUIREMENT: Output ONLY valid JSON using this exact structure. 
        For the "type" field in each section, you MUST strictly use one of these exact strings so the frontend can render it: 
        "Multiple Choice Questions", "Short Questions", "Numerical Problems", or "Diagram/Graph-Based Questions".
        If the type is "Multiple Choice Questions", you MUST include an "options" array with 4 choices.

        {
          "assignmentDetails": {
            "subject": "Determined by instructions/document",
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