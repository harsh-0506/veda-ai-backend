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
        You are an expert teacher creating a Science exam paper for Class 3 students (8-9 years old). 
        
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

        CRITICAL INSTRUCTIONS FOR AI (STRICTLY ENFORCED):
        1. ZERO HALLUCINATION (STRICT TEXT-BOUND RULE): You MUST extract facts ONLY from the "SOURCE MATERIAL" provided above. The material explicitly covers topics like Seeds, Germination, Kharif/Rabi Crops, Balanced Diet, Deficiency Diseases, and Rocks/Minerals. Do NOT invent questions about outer space, planets, advanced biology, or anything else not explicitly written in the provided text.
        2. GRADE LEVEL: This is for Class 3. Keep vocabulary simple and appropriate for 8-9 year olds.
        3. ABSOLUTELY NO REPETITION: You MUST track the concepts you test. If you test "seed coat" or "magma" in the MCQ section, you are STRICTLY FORBIDDEN from asking about them again in the Fill in the Blanks, True/False, or One Word sections. Every single question across the ENTIRE exam must test a completely unique concept from the text.
        4. Fill in the blanks: The question "text" MUST be a complex sentence that tests comprehension. DO NOT just put the blank at the end. The blank line (represented by "__________") MUST be in the middle of the sentence. 
           - BAD (Avoid this): "The outer covering of a seed is called the __________."
           - GOOD: "The __________ acts as the outer protective layer of a seed, ensuring the baby plant inside remains safe."
           - Ensure the sentence requires the student to understand the relationship between the concepts.
        5. Match the Following: If a section is "Match the following", do NOT write standard text questions. You must provide a "matchPairs" array inside the question object containing 4 to 5 key-value pairs pulled from the text (e.g., {"left": "Carrot", "right": "Root"}).
        6. Give Examples: Look at the "extraParam" field to know exactly how many examples to ask for (e.g., "Give 2 examples of Rabi crops").
        7. Assertion/Reason: Use standard A & R formatting with 4 choices.
        8. Internal Choice (OR): If a section has "hasOrChoice: true", you MUST add an "orQuestionText" property to AT LEAST ONE question in that section to give the student an alternative choice.
        9. Attempt Limits: If "attemptCount" is less than "count", add instructions to the section title (e.g., "Attempt any 3 out of 4 questions").

        CRITICAL REQUIREMENT: Output ONLY valid JSON using this exact modular structure. The schoolName and examination fields MUST be strictly hardcoded as shown below.
        
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
              "sectionTitle": "Section A: [Insert Type Here]",
              "instructions": "Attempt [attemptCount] questions from this section.",
              "type": "[Matches the type requested by teacher]",
              "questions": [
                {
                  "id": "q-1",
                  "text": "Primary question text here... (Derived strictly from the source text. If Fill in the blank, include __________)",
                  "orQuestionText": "Alternative question text goes here (ONLY if hasOrChoice is true for this section, otherwise omit this field)",
                  "options": ["a", "b", "c", "d"], 
                  "matchPairs": [ {"left": "Igneous rock", "right": "Pumice"}, {"left": "Deficiency of iron", "right": "Anaemia"} ],
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