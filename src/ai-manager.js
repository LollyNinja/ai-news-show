// AI task management and distribution system
// Handles load balancing, parallel processing, and queue optimization

// Track available models and their current load
const aiModels = {
    dialogue: [
        { id: 'primary', maxConcurrent: 5, current: 0 },
        { id: 'secondary', maxConcurrent: 5, current: 0 },
        { id: 'fallback', maxConcurrent: 10, current: 0 }
    ],
    tts: [
        { id: 'tts-service-1', maxConcurrent: 8, current: 0 },
        { id: 'tts-service-2', maxConcurrent: 8, current: 0 }
    ]
};

// Active tasks being processed
const activeTasks = new Map();

// Task queue management
const taskQueues = {
    dialogue: [],
    tts: []
};

// Process tasks in parallel with load balancing
function selectModelForTask(taskType) {
    const models = aiModels[taskType];
    
    // Find model with lowest current load relative to its capacity
    let selectedModel = null;
    let lowestLoadRatio = Infinity;
    
    for (const model of models) {
        const loadRatio = model.current / model.maxConcurrent;
        if (loadRatio < lowestLoadRatio && model.current < model.maxConcurrent) {
            lowestLoadRatio = loadRatio;
            selectedModel = model;
        }
    }
    
    // If all models are at capacity, return the one with the lowest absolute load
    if (!selectedModel) {
        selectedModel = models.reduce((lowest, current) => 
            current.current < lowest.current ? current : lowest, models[0]);
    }
    
    // Increment the load counter
    selectedModel.current++;
    return selectedModel;
}

// Release model resources when task completes
function releaseModel(taskType, modelId) {
    const model = aiModels[taskType].find(m => m.id === modelId);
    if (model && model.current > 0) {
        model.current--;
    }
}

// Generate news dialogue with load balancing
export async function generateNewsDialogueDistributed(topic, linesPerAnchor, tone, jamesPersonality, sarahPersonality) {
    const taskId = `dialogue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create task
    const task = {
        id: taskId,
        type: 'dialogue',
        priority: 1, // Standard priority
        status: 'queued',
        params: { topic, linesPerAnchor, tone, jamesPersonality, sarahPersonality }
    };
    
    // Add to queue or process immediately if capacity available
    const canProcessImmediately = aiModels.dialogue.some(m => m.current < m.maxConcurrent);
    
    if (canProcessImmediately) {
        return processDialogueTask(task);
    } else {
        // Add to queue with promise resolution pattern
        return new Promise((resolve, reject) => {
            taskQueues.dialogue.push({
                ...task,
                resolve,
                reject
            });
            
            // Process queue on next tick to avoid blocking
            setTimeout(processQueues, 0);
        });
    }
}

// Process dialogue generation task
async function processDialogueTask(task) {
    const { topic, linesPerAnchor, tone, jamesPersonality, sarahPersonality } = task.params;
    const selectedModel = selectModelForTask('dialogue');
    
    try {
        // Update task status
        task.status = 'processing';
        task.model = selectedModel.id;
        activeTasks.set(task.id, task);
        
        // Build tone instructions based on selection
        let toneInstructions = '';
        switch(tone) {
            case 'satire':
                toneInstructions = 'Use a satirical, humorous tone. Include witty remarks, light sarcasm, and playful commentary while still covering the topic.';
                break;
            case 'dramatic':
                toneInstructions = 'Use a dramatic, intense tone. Emphasize surprising elements, use stronger language, and create a sense of urgency or importance.';
                break;
            case 'casual':
                toneInstructions = 'Use a casual, conversational tone. Present the news in a relaxed, friendly manner as if chatting with viewers.';
                break;
            case 'optimistic':
                toneInstructions = 'Use an optimistic, positive tone. Focus on hopeful aspects, potential solutions, and silver linings related to the topic.';
                break;
            case 'serious':
            default:
                toneInstructions = 'Use a serious, professional tone typical of mainstream news broadcasts. Be factual, balanced, and straightforward.';
        }
        
        // Build personality instructions
        let personalityInstructions = 'ANCHOR PERSONALITIES:\n';
        
        // James personality
        personalityInstructions += 'James Miller: ';
        switch(jamesPersonality) {
            case 'professional':
                personalityInstructions += 'Professional and composed. Maintains a formal demeanor and sticks to the facts.';
                break;
            case 'flirtatious':
                personalityInstructions += 'Subtly flirtatious with Sarah. Occasionally makes charming comments or compliments while maintaining broadcast professionalism.';
                break;
            case 'argumentative':
                personalityInstructions += 'Slightly argumentative. Often plays devil\'s advocate and challenges statements with counterpoints.';
                break;
            case 'nervous':
                personalityInstructions += 'Somewhat nervous or anxious. Occasionally uses filler words or shows subtle signs of being flustered.';
                break;
            case 'enthusiastic':
                personalityInstructions += 'Very enthusiastic and energetic. Shows excitement about the news topic with animated language.';
                break;
            case 'skeptical':
                personalityInstructions += 'Skeptical and questioning. Approaches topics with caution and asks probing questions.';
                break;
        }
        
        // Sarah personality
        personalityInstructions += '\nSarah Johnson: ';
        switch(sarahPersonality) {
            case 'professional':
                personalityInstructions += 'Professional and composed. Maintains a formal demeanor and sticks to the facts.';
                break;
            case 'flirtatious':
                personalityInstructions += 'Subtly flirtatious with James. Occasionally makes charming comments or compliments while maintaining broadcast professionalism.';
                break;
            case 'argumentative':
                personalityInstructions += 'Slightly argumentative. Often challenges statements and provides alternative perspectives.';
                break;
            case 'nervous':
                personalityInstructions += 'Somewhat nervous or anxious. Occasionally uses filler words or shows subtle signs of being flustered.';
                break;
            case 'enthusiastic':
                personalityInstructions += 'Very enthusiastic and energetic. Shows excitement about the news topic with animated language.';
                break;
            case 'skeptical':
                personalityInstructions += 'Skeptical and questioning. Approaches topics with caution and asks probing questions.';
                break;
        }
        
        // Add interaction guidance
        personalityInstructions += '\n\nIMPORTANT: These personality traits should be subtle and appropriate for a news broadcast. The personalities should complement, not override, the overall tone of the broadcast. Keep the news content as the primary focus while letting these personality traits influence the delivery style and interactions between anchors.';
        
        // Calculate total exchanges - alternating between the two anchors
        const totalExchanges = linesPerAnchor * 2;
        
        // Generate dialogue using LLM
        const completion = await websim.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `You are a news script writer. Create a back-and-forth dialogue between two news anchors named James Miller and Sarah Johnson discussing the following topic: "${topic}".
                    Write a script with exactly ${totalExchanges} exchanges (${linesPerAnchor} for each anchor), alternating between James and Sarah.
                    Each anchor's line should be 1-2 sentences long, concise, and informative.
                    Start with James introducing the topic, and end with Sarah wrapping up.
                    
                    ${toneInstructions}
                    
                    ${personalityInstructions}
                    
                    Format the response as a JSON array with objects containing 'speaker' (either 'James' or 'Sarah') and 'text' fields.
                    Make it sound like a professional news broadcast with clear transitions between speakers.`
                },
                {
                    role: "user",
                    content: `Create a ${tone} news dialogue about: ${topic} with ${linesPerAnchor} lines per anchor. James has a ${jamesPersonality} personality and Sarah has a ${sarahPersonality} personality.`
                }
            ],
            json: true
        });

        let dialogue = JSON.parse(completion.content);
        
        // Add outro lines
        dialogue.push({
            speaker: 'James',
            text: 'This has been AI News Network.'
        });
        dialogue.push({
            speaker: 'Sarah',
            text: 'Thank you for watching.'
        });
        
        // Task completed successfully
        task.status = 'completed';
        activeTasks.delete(task.id);
        releaseModel('dialogue', selectedModel.id);
        
        return dialogue;
    } catch (error) {
        console.error("Error in dialogue generation:", error);
        
        // Mark task as failed
        task.status = 'failed';
        task.error = error.message;
        activeTasks.delete(task.id);
        releaseModel('dialogue', selectedModel.id);
        
        throw error;
    } finally {
        // Process next task in queue
        processQueues();
    }
}

// Process text-to-speech with parallel distribution
export async function generateTTSDistributed(textSegments) {
    // Process all TTS segments in parallel with load balancing
    const ttsPromises = textSegments.map((segment, index) => {
        return generateSingleTTS(segment, index);
    });
    
    // Wait for all TTS generations to complete
    return Promise.all(ttsPromises);
}

// Generate a single TTS segment using the distributed system
async function generateSingleTTS(segment, index) {
    const taskId = `tts-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create task
    const task = {
        id: taskId,
        type: 'tts',
        priority: 1, // Standard priority
        status: 'queued',
        params: { segment, index }
    };
    
    // Process immediately if capacity available, otherwise queue
    const canProcessImmediately = aiModels.tts.some(m => m.current < m.maxConcurrent);
    
    if (canProcessImmediately) {
        return processTTSTask(task);
    } else {
        // Add to queue with promise resolution pattern
        return new Promise((resolve, reject) => {
            taskQueues.tts.push({
                ...task,
                resolve,
                reject
            });
            
            // Process queue on next tick
            setTimeout(processQueues, 0);
        });
    }
}

// Process a single TTS task
async function processTTSTask(task) {
    const { segment, index } = task.params;
    const selectedModel = selectModelForTask('tts');
    
    try {
        // Update task status
        task.status = 'processing';
        task.model = selectedModel.id;
        activeTasks.set(task.id, task);
        
        // Determine voice based on speaker
        const voice = segment.speaker === 'James' ? 'en-male' : 'en-female';
        
        // Generate TTS using websim TTS
        const result = await websim.textToSpeech({
            text: segment.text,
            voice: voice
        });
        
        // Create audio element for the TTS result
        const audio = new Audio();
        
        // Wait for audio to be loaded
        await new Promise((resolve) => {
            audio.addEventListener('canplaythrough', () => resolve(), { once: true });
            audio.addEventListener('error', (e) => {
                console.error('Audio load error:', e);
                resolve(); // Resolve anyway to not block the broadcast
            });
            
            audio.src = result.url;
            audio.load(); // Start loading the audio
        });
        
        // Task completed successfully
        task.status = 'completed';
        activeTasks.delete(task.id);
        releaseModel('tts', selectedModel.id);
        
        // Return processed segment
        return {
            audio: audio,
            speaker: segment.speaker,
            text: segment.text,
            index: index // Maintain original order
        };
    } catch (error) {
        console.error("Error in TTS generation:", error);
        
        // Mark task as failed
        task.status = 'failed';
        task.error = error.message;
        activeTasks.delete(task.id);
        releaseModel('tts', selectedModel.id);
        
        throw error;
    } finally {
        // Process next task in queue
        processQueues();
    }
}

// Process tasks from queues as resources become available
function processQueues() {
    // Process dialogue queue
    while (taskQueues.dialogue.length > 0) {
        // Check if any model has capacity
        const hasCapacity = aiModels.dialogue.some(m => m.current < m.maxConcurrent);
        if (!hasCapacity) break;
        
        // Get next task
        const queuedTask = taskQueues.dialogue.shift();
        
        // Process task and resolve/reject its promise
        processDialogueTask(queuedTask)
            .then(result => queuedTask.resolve(result))
            .catch(error => queuedTask.reject(error));
    }
    
    // Process TTS queue
    while (taskQueues.tts.length > 0) {
        // Check if any model has capacity
        const hasCapacity = aiModels.tts.some(m => m.current < m.maxConcurrent);
        if (!hasCapacity) break;
        
        // Get next task
        const queuedTask = taskQueues.tts.shift();
        
        // Process task and resolve/reject its promise
        processTTSTask(queuedTask)
            .then(result => queuedTask.resolve(result))
            .catch(error => queuedTask.reject(error));
    }
}

// Get current AI system status (for monitoring)
export function getAISystemStatus() {
    return {
        models: {
            dialogue: aiModels.dialogue.map(m => ({ 
                id: m.id, 
                load: `${m.current}/${m.maxConcurrent}`,
                utilization: Math.round((m.current / m.maxConcurrent) * 100)
            })),
            tts: aiModels.tts.map(m => ({ 
                id: m.id, 
                load: `${m.current}/${m.maxConcurrent}`,
                utilization: Math.round((m.current / m.maxConcurrent) * 100)
            }))
        },
        queues: {
            dialogue: taskQueues.dialogue.length,
            tts: taskQueues.tts.length
        },
        activeTasks: Array.from(activeTasks.values()).map(t => ({
            id: t.id,
            type: t.type,
            status: t.status,
            model: t.model
        }))
    };
}

// Preload all audio for dialogue with parallel processing
export async function preloadAllAudioDistributed(dialogue, callbacks, isBackground = false) {
    console.log("Preloading audio in parallel for dialogue", dialogue);
    
    try {
        // Start with 0% progress
        if (!isBackground) {
            callbacks.updateProgress(0);
        }
        
        // Validate dialogue
        if (!dialogue || !Array.isArray(dialogue) || dialogue.length === 0) {
            throw new Error('Invalid dialogue data provided');
        }
        
        // Process all TTS segments in parallel with load balancing
        const processedSegments = await generateTTSDistributed(dialogue);
        
        // Sort by original index to maintain order
        processedSegments.sort((a, b) => a.index - b.index);
        
        // Final audio segments (without index)
        const finalAudio = processedSegments.map(({ audio, speaker, text }) => ({
            audio, speaker, text
        }));
        
        // Complete progress
        if (!isBackground) {
            callbacks.updateProgress(100);
            callbacks.updateStatus('All audio loaded in parallel! Starting broadcast...');
        }
        
        return finalAudio;
    } catch (error) {
        console.error("Error in parallel audio preloading:", error);
        throw error;
    }
}