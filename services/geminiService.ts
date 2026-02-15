
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { getSystemInstruction } from "../constants";
import { Language, AnalysisResult } from "../types";

// Safely access process.env.API_KEY to prevent crashing if process is undefined
const getApiKey = (): string => {
  try {
    // @ts-ignore
    return (typeof process !== 'undefined' && process.env && process.env.API_KEY) || '';
  } catch (e) {
    console.warn("Error accessing process.env", e);
    return '';
  }
};

const apiKey = getApiKey();

const getAIClient = () => {
  if (!apiKey) {
    console.warn("API Key is missing. Please set process.env.API_KEY.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const analyzeSmali = async (code: string, language: Language): Promise<AnalysisResult> => {
  const ai = getAIClient();
  if (!ai) return { message: "Error: API Key is missing. Unable to contact AI Tutor.", fixedCode: null };

  try {
    // Structured prompt to separate analysis from code fix
    const prompt = `Analyze the following Smali code.
    
    1. First, provide a bullet-point summary of any errors, potential crashes, or register leaks. Also explain the logic briefly. Use Markdown headers (###) and bold text (**text**) for clarity.
    2. Second, IF there are errors or improvements, provide the FULL corrected Smali code wrapped in a code block like this:
    
    \`\`\`smali
    ... corrected code here ...
    \`\`\`
    
    If the code is already correct, do NOT provide a code block, just say it is correct.
    
    Here is the code:
    \`\`\`smali
    ${code}
    \`\`\`
    `;
    
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: getSystemInstruction(language),
      }
    });

    const fullText = response.text || "No analysis generated. The model might have been blocked by safety settings.";
    
    // Extract Fixed Code Block
    const codeBlockRegex = /```smali\s*([\s\S]*?)```/;
    const match = fullText.match(codeBlockRegex);
    
    let message = fullText;
    let fixedCode: string | null = null;

    if (match) {
        fixedCode = match[1].trim();
        // Remove the code block from the message to keep the UI clean
        message = fullText.replace(codeBlockRegex, '').trim();
    }

    return { message, fixedCode };

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return { message: "Failed to analyze code. Please check your connection and API key.", fixedCode: null };
  }
};

export const convertJavaToSmali = async (javaCode: string): Promise<string> => {
    const ai = getAIClient();
    if (!ai) return "# Error: API Key missing.";

    try {
        const prompt = `Convert the following Java code to Smali. 
        If it's a snippet, just provide the Smali instructions. 
        If it's a full class, provide the full Smali class.
        
        Output ONLY the raw Smali code inside a code block. Do not add explanations.
        
        Java Code:
        ${javaCode}`;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt
        });

        const text = response.text || "";
        // Extract content from code block if present
        const match = text.match(/```(?:smali)?\s*([\s\S]*?)```/);
        return match ? match[1].trim() : text.trim();

    } catch (error) {
        console.error("Conversion Error:", error);
        return "# Error converting code. Please try again.";
    }
}

// Global session state
let chatSession: Chat | null = null;
let currentLanguage: Language = 'en';

export const sendMessageToTutor = async (message: string, language: Language, codeContext?: string): Promise<string> => {
  const ai = getAIClient();
  if (!ai) return "Error: API Key is missing. I cannot reply.";

  try {
    // Re-create session if language changed or doesn't exist
    if (!chatSession || currentLanguage !== language) {
      console.log("Creating new Chat Session");
      chatSession = ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: {
          systemInstruction: getSystemInstruction(language),
        },
      });
      currentLanguage = language;
    }

    // Construct the message. If codeContext is provided, append it.
    let fullMessage = message;
    if (codeContext) {
      fullMessage = `${message}\n\nHere is the Smali code I am referring to:\n\`\`\`smali\n${codeContext}\n\`\`\``;
    }

    console.log("Sending message to Gemini...");
    const response: GenerateContentResponse = await chatSession.sendMessage({ message: fullMessage });
    
    // Check if text exists, otherwise check for candidates (safety blocks)
    if (response.text) {
        return response.text;
    } else {
        console.warn("Empty response text", response);
        return "I received an empty response. I might be unable to answer this specific query due to safety filters.";
    }

  } catch (error) {
    console.error("Gemini Chat Error:", error);
    // If chat fails (e.g. token expiry, network, or bad state), reset session
    chatSession = null; 
    return "Sorry, I encountered an error (Connection or API limit). Please try asking again.";
  }
};

export const resetChat = () => {
  console.log("Resetting Chat Session");
  chatSession = null;
};
    return { message, fixedCode };

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return { message: "Failed to analyze code. Please try again later.", fixedCode: null };
  }
};

export const convertJavaToSmali = async (javaCode: string): Promise<string> => {
    const ai = getAIClient();
    if (!ai) return "Error: API Key missing.";

    try {
        const prompt = `Convert the following Java code to Smali. 
        If it's a snippet, just provide the Smali instructions. 
        If it's a full class, provide the full Smali class.
        
        Output ONLY the raw Smali code inside a code block. Do not add explanations.
        
        Java Code:
        ${javaCode}`;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt
        });

        const text = response.text || "";
        // Extract content from code block if present
        const match = text.match(/```(?:smali)?\s*([\s\S]*?)```/);
        return match ? match[1].trim() : text.trim();

    } catch (error) {
        console.error("Conversion Error:", error);
        return "# Error converting code. Please try again.";
    }
}

// We manage a chat session map or just a single session for simplicity, but we need to update system instruction if language changes.
// The SDK's Chat object has immutable config once created usually, so we might need to recreate it if language changes.
let chatSession: Chat | null = null;
let currentLanguage: Language = 'en';

export const sendMessageToTutor = async (message: string, language: Language, codeContext?: string): Promise<string> => {
  const ai = getAIClient();
  if (!ai) return "Error: API Key is missing.";

  try {
    // Re-create session if language changed or doesn't exist
    if (!chatSession || currentLanguage !== language) {
      chatSession = ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: {
          systemInstruction: getSystemInstruction(language),
        },
      });
      currentLanguage = language;
    }

    // Construct the message. If codeContext is provided, append it.
    let fullMessage = message;
    if (codeContext) {
      fullMessage = `${message}\n\nHere is the Smali code I am referring to:\n\`\`\`smali\n${codeContext}\n\`\`\``;
    }

    const response = await chatSession.sendMessage({ message: fullMessage });
    return response.text || "I couldn't generate a response.";
  } catch (error) {
    console.error("Gemini Chat Error:", error);
    // If chat fails (e.g. token expiry or other issue), try resetting
    chatSession = null; 
    return "Sorry, I encountered an error. Please try asking again.";
  }
};

export const resetChat = () => {
  chatSession = null;
};
