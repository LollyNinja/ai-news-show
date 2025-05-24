// Dialogue generation and management

import { elements } from './ui.js';
import { generateNewsDialogueDistributed } from './ai-manager.js';

// Generate news dialogue using AI with distributed processing
export async function generateNewsDialogue(topic, linesPerAnchor) {
    // Get the selected tone for the broadcast
    const tone = elements.broadcastTone.value;
    
    // Get personality traits for each anchor
    const jamesPersonality = elements.anchor1Personality.value;
    const sarahPersonality = elements.anchor2Personality.value;
    
    // Use the distributed AI system to generate dialogue
    try {
        return await generateNewsDialogueDistributed(
            topic, 
            linesPerAnchor, 
            tone, 
            jamesPersonality, 
            sarahPersonality
        );
    } catch (error) {
        console.error("Failed to generate dialogue:", error);
        throw new Error("Failed to generate news dialogue");
    }
}