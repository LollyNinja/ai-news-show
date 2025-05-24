// Broadcast queue management

import { elements } from '../ui.js';
import { 
    toggleQueueInfo, updateQueuedTopics, 
    updateQueueStatus, renderQueueList as uiRenderQueueList 
} from '../ui.js';
import { generateNewsDialogue } from '../dialogue.js';
import { preloadAllAudio } from '../audio.js';

// Queue management
let broadcastQueue = [];
let processingCount = 0;
const MAX_PARALLEL_PROCESSING = 3; // Process up to 3 broadcasts in parallel

// Add a broadcast to the queue
export async function addToQueue() {
    const topic = elements.topicInput.value.trim();
    if (!topic) {
        elements.status.textContent = 'Please enter a topic for the queued broadcast.';
        return;
    }
    
    // Create a new queue item
    const queueItem = {
        id: Date.now(), 
        topic: topic,
        dialogue: null,
        audio: null,
        status: 'preparing', 
        position: broadcastQueue.length 
    };
    
    // Add to queue
    broadcastQueue.push(queueItem);
    
    // Update UI
    elements.topicInput.value = '';
    toggleQueueInfo(true);
    renderQueueList(broadcastQueue);
    updateQueueStatus(`Preparing ${broadcastQueue.length} broadcast${broadcastQueue.length > 1 ? 's' : ''} in queue`);
    
    // Process queued broadcasts in parallel up to the maximum limit
    if (processingCount < MAX_PARALLEL_PROCESSING) {
        prepareQueuedBroadcast(queueItem);
    }
}

// Re-export renderQueueList from ui.js
export function renderQueueList(queue) {
    return uiRenderQueueList(queue);
}

// Prepare a queued broadcast in the background
async function prepareQueuedBroadcast(queueItem) {
    // Increment processing counter
    processingCount++;
    
    try {
        // Get settings for the queued broadcast
        const linesPerAnchor = parseInt(elements.linesPerAnchorSlider.value);
        
        // Update status
        queueItem.status = 'generating';
        renderQueueList(broadcastQueue);
        
        // Generate the dialogue in the background
        const dialogue = await generateNewsDialogue(queueItem.topic, linesPerAnchor);
        
        if (dialogue && dialogue.length > 0) {
            queueItem.dialogue = dialogue;  
            queueItem.status = 'loading';
            renderQueueList(broadcastQueue);
            
            // Define callbacks for the preloading process
            const preloadCallbacks = {
                updateProgress: () => {}, 
                updateStatus: () => {}, 
                updateCountdown: (loaded, total) => {
                    queueItem.loadProgress = `${loaded}/${total}`;
                    renderQueueList(broadcastQueue);
                }
            };
            
            // Preload the audio in parallel
            const preloadedAudio = await preloadAllAudio(dialogue, preloadCallbacks, true);
            
            if (preloadedAudio) {
                queueItem.audio = preloadedAudio;
                queueItem.status = 'ready';
                renderQueueList(broadcastQueue);
                updateQueueStatus(`${broadcastQueue.length} broadcast${broadcastQueue.length > 1 ? 's' : ''} in queue`);
            } else {
                throw new Error('Failed to preload audio for queued broadcast.');
            }
        } else {
            throw new Error('Failed to generate dialogue for queued broadcast.');
        }
    } catch (error) {
        console.error('Error preparing queued broadcast:', error);
        queueItem.status = 'error';
        queueItem.error = error.message;
        renderQueueList(broadcastQueue);
    } finally {
        // Decrement processing counter
        processingCount--;
        
        // Process next item in queue if any are waiting
        processNextInQueue();
    }
}

// Process next broadcast in queue if under parallel limit
export function processNextInQueue() {
    // Find items that are still in 'preparing' state
    const pendingItems = broadcastQueue.filter(item => item.status === 'preparing');
    
    // Process as many items as we can up to the parallel limit
    while (pendingItems.length > 0 && processingCount < MAX_PARALLEL_PROCESSING) {
        const nextItem = pendingItems.shift();
        prepareQueuedBroadcast(nextItem);
    }
}

// Process the queue (start preparing broadcasts)
export function processQueue() {
    processNextInQueue();
}

// Remove a specific broadcast from the queue
export function removeFromQueue(id) {
    const index = broadcastQueue.findIndex(item => item.id === id);
    if (index !== -1) {
        broadcastQueue.splice(index, 1);
        
        // Update positions for remaining items
        broadcastQueue.forEach((item, idx) => {
            item.position = idx;
        });
        
        renderQueueList(broadcastQueue);
        updateQueueStatus(`${broadcastQueue.length} broadcast${broadcastQueue.length > 1 ? 's' : ''} in queue`);
        
        if (broadcastQueue.length === 0) {
            toggleQueueInfo(false);
        }
    }
}

// Get the full queue
export function getQueue() {
    return broadcastQueue;
}

// Get next ready broadcast from the queue
export function getNextReadyBroadcast() {
    return broadcastQueue.length > 0 && broadcastQueue[0].status === 'ready' ? broadcastQueue[0] : null;
}

// Remove the first broadcast from the queue
export function removeFirstFromQueue() {
    if (broadcastQueue.length > 0) {
        broadcastQueue.shift();
        
        // Update positions for remaining items
        broadcastQueue.forEach((item, idx) => {
            item.position = idx;
        });
        
        renderQueueList(broadcastQueue);
        
        if (broadcastQueue.length === 0) {
            toggleQueueInfo(false);
        } else {
            updateQueueStatus(`${broadcastQueue.length} broadcast${broadcastQueue.length > 1 ? 's' : ''} remaining in queue`);
        }
    }
}

// Update queue UI
export function updateQueueUI() {
    renderQueueList(broadcastQueue);
    updateQueuedTopics(broadcastQueue);
    updateQueueStatus(`${broadcastQueue.length} broadcast${broadcastQueue.length > 1 ? 's' : ''} in queue`);
}

// Get queue status
export function getQueueStatus() {
    return {
        length: broadcastQueue.length,
        processing: processingCount,
        ready: broadcastQueue.filter(item => item.status === 'ready').length,
        preparing: broadcastQueue.filter(item => item.status === 'preparing').length,
        generating: broadcastQueue.filter(item => item.status === 'generating').length,
        loading: broadcastQueue.filter(item => item.status === 'loading').length,
        error: broadcastQueue.filter(item => item.status === 'error').length
    };
}